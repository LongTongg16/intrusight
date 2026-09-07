"""Safely create an administrator against an explicitly selected MongoDB target."""

import argparse
import asyncio
import os
import re
import sys
import warnings
from dataclasses import dataclass, field
from datetime import datetime, timezone
from getpass import GetPassWarning, getpass
from typing import Callable, Sequence

from email_validator import EmailNotValidError, validate_email
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import (
    AutoReconnect,
    ConfigurationError,
    ConnectionFailure,
    DuplicateKeyError,
    InvalidName,
    InvalidURI,
    OperationFailure,
    PyMongoError,
    ServerSelectionTimeoutError,
)

from config import load_backend_env
from core.password_security import hash_password
from models.user import RoleEnum
from services.user_validation import validate_full_name, validate_password_strength


DEFAULT_DATABASE_NAME = "siemless_db"
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
HOSTNAME_RE = re.compile(r"^[A-Za-z0-9._-]+$")
CLIENT_OPTIONS = {
    "serverSelectionTimeoutMS": 2000,
    "connectTimeoutMS": 2000,
}


class OperatorError(RuntimeError):
    """A safe, actionable error that may be shown to an operator."""


@dataclass(frozen=True)
class DatabaseTarget:
    environment: str
    database_name: str
    hosts: tuple[str, ...]
    mongodb_url: str = field(repr=False)
    is_local: bool = False


@dataclass(frozen=True)
class AdministratorDetails:
    email: str
    full_name: str
    password: str = field(repr=False)


def _read_secret(prompt: str, getpass_fn: Callable[[str], str]) -> str:
    """Read hidden input, refusing getpass's potentially echoed fallback."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", GetPassWarning)
            return getpass_fn(prompt)
    except GetPassWarning as exc:
        raise OperatorError(
            "Secure hidden input is unavailable. Run this tool in an interactive terminal."
        ) from exc


def _split_host(entry: str, *, srv: bool) -> tuple[str, str]:
    """Return a validated host and its safe display form."""
    entry = entry.strip()
    if not entry:
        raise OperatorError("MongoDB URL does not contain a host")

    if entry.startswith("["):
        closing = entry.find("]")
        if closing < 0:
            raise OperatorError("MongoDB URL contains an invalid IPv6 host")
        host = entry[1:closing]
        suffix = entry[closing + 1 :]
        if suffix and (not suffix.startswith(":") or not suffix[1:].isdigit()):
            raise OperatorError("MongoDB URL contains an invalid port")
        if suffix and not 1 <= int(suffix[1:]) <= 65535:
            raise OperatorError("MongoDB URL contains an invalid port")
        if srv and suffix:
            raise OperatorError("mongodb+srv URLs must not include a port")
        if not host or not all(
            character in "0123456789abcdefABCDEF:" for character in host
        ):
            raise OperatorError("MongoDB URL contains an invalid IPv6 host")
        display = f"[{host}]{suffix}"
        return host.lower(), display

    if entry.count(":") > 1:
        raise OperatorError("IPv6 MongoDB hosts must be enclosed in brackets")
    if ":" in entry:
        host, port = entry.rsplit(":", 1)
        if not port.isdigit() or not 1 <= int(port) <= 65535:
            raise OperatorError("MongoDB URL contains an invalid port")
        if srv:
            raise OperatorError("mongodb+srv URLs must not include a port")
        display = f"{host}:{port}"
    else:
        host = entry
        display = host

    if not host or not HOSTNAME_RE.fullmatch(host):
        raise OperatorError("MongoDB URL contains an invalid host")
    return host.lower().rstrip("."), display


def _safe_hosts(mongodb_url: str) -> tuple[tuple[str, ...], tuple[str, ...]]:
    """Extract hosts without returning credentials, paths, or query parameters."""
    scheme, separator, remainder = mongodb_url.partition("://")
    scheme = scheme.lower()
    if not separator or scheme not in {"mongodb", "mongodb+srv"}:
        raise OperatorError("MongoDB URL must start with mongodb:// or mongodb+srv://")
    if not remainder or not remainder.isprintable():
        raise OperatorError("MongoDB URL is malformed")

    authority_end = len(remainder)
    for delimiter in "/?#":
        position = remainder.find(delimiter)
        if position >= 0:
            authority_end = min(authority_end, position)
    authority = remainder[:authority_end]
    trailing = remainder[authority_end:]
    if "@" in trailing:
        # Usually an unescaped URI delimiter inside credentials. Never risk
        # presenting a credential fragment as though it were a hostname.
        raise OperatorError(
            "MongoDB URL is malformed; URI credentials must be percent-encoded"
        )

    if "@" in authority:
        user_info, authority = authority.rsplit("@", 1)
        if not user_info or "@" in user_info:
            raise OperatorError("MongoDB URL contains malformed credentials")
    if not authority:
        raise OperatorError("MongoDB URL does not contain a host")

    entries = authority.split(",")
    srv = scheme == "mongodb+srv"
    if srv and len(entries) != 1:
        raise OperatorError("mongodb+srv URLs must contain exactly one host")

    parsed = tuple(_split_host(entry, srv=srv) for entry in entries)
    normalized_hosts = tuple(item[0] for item in parsed)
    display_hosts = tuple(item[1] for item in parsed)
    return normalized_hosts, display_hosts


def _validate_database_name(database_name: str) -> str:
    database_name = database_name.strip()
    if not database_name:
        raise OperatorError("Database name cannot be empty")
    if not database_name.isprintable():
        raise OperatorError("Database name contains invalid characters")
    if len(database_name.encode("utf-8")) > 63:
        raise OperatorError("Database name must not exceed 63 UTF-8 bytes")
    if any(character in database_name for character in '/\\ ."$*<>:|?'):
        raise OperatorError("Database name contains characters MongoDB does not allow")
    return database_name


def _make_target(
    mongodb_url: str,
    database_name: str,
    *,
    environment: str,
    require_local: bool,
) -> DatabaseTarget:
    mongodb_url = mongodb_url.strip()
    if not mongodb_url:
        raise OperatorError("MongoDB URL cannot be empty")
    normalized_hosts, display_hosts = _safe_hosts(mongodb_url)
    if require_local and any(host not in LOCAL_HOSTS for host in normalized_hosts):
        raise OperatorError(
            "Local target is configured with a non-local MongoDB host. "
            "Choose Custom / production to use a remote database."
        )
    return DatabaseTarget(
        environment=environment,
        database_name=_validate_database_name(database_name),
        hosts=display_hosts,
        mongodb_url=mongodb_url,
        is_local=require_local,
    )


def _choose_mode(input_fn: Callable[[str], str]) -> str:
    print("Database target:")
    print("  1. Local MongoDB")
    print("  2. Custom / production MongoDB")
    while True:
        choice = input_fn("Select target: ").strip().lower()
        if choice in {"1", "local"}:
            return "local"
        if choice in {"2", "custom", "production"}:
            return "custom"
        print("Please enter 1 for Local or 2 for Custom / production.")


def prompt_database_target(
    mode: str | None = None,
    *,
    input_fn: Callable[[str], str] = input,
    getpass_fn: Callable[[str], str] = getpass,
) -> DatabaseTarget:
    """Prompt for and return a target without connecting or changing data."""
    selected_mode = mode or _choose_mode(input_fn)
    if selected_mode == "local":
        load_backend_env()
        mongodb_url = os.getenv("MONGODB_URL", "")
        if not mongodb_url:
            raise OperatorError(
                "MONGODB_URL is not configured. Add a localhost MongoDB URL to "
                "backend/.env or the process environment."
            )
        database_name = os.getenv("DATABASE_NAME", DEFAULT_DATABASE_NAME)
        return _make_target(
            mongodb_url,
            database_name,
            environment="local",
            require_local=True,
        )

    if selected_mode == "custom":
        mongodb_url = _read_secret("MongoDB URL: ", getpass_fn).strip()
        database_name = input_fn(
            f"Database name [{DEFAULT_DATABASE_NAME}]: "
        ).strip() or DEFAULT_DATABASE_NAME
        return _make_target(
            mongodb_url,
            database_name,
            environment="custom/production",
            require_local=False,
        )

    raise OperatorError("Unknown database target")


def print_target_summary(target: DatabaseTarget) -> None:
    print("\nConnecting to:")
    print(f"  Environment: {target.environment}")
    print(f"  Database: {target.database_name}")
    print(f"  Host: {', '.join(target.hosts)}")


def prompt_administrator_details(
    *,
    input_fn: Callable[[str], str] = input,
    getpass_fn: Callable[[str], str] = getpass,
) -> AdministratorDetails:
    email_input = input_fn("Administrator email: ").strip().lower()
    full_name = input_fn("Administrator full name: ").strip()
    password = _read_secret("Password: ", getpass_fn)
    confirmation = _read_secret("Confirm password: ", getpass_fn)

    if password != confirmation:
        raise OperatorError("Passwords do not match")

    try:
        email = validate_email(email_input, check_deliverability=False).normalized
        validate_full_name(full_name)
        validate_password_strength(password)
    except (EmailNotValidError, ValueError) as exc:
        raise OperatorError(str(exc)) from exc

    return AdministratorDetails(email=email, full_name=full_name, password=password)


def _connection_error(target: DatabaseTarget) -> str:
    if target.is_local:
        return (
            "Local MongoDB is unreachable. Start the local MongoDB service and "
            "verify MONGODB_URL in backend/.env."
        )
    return (
        "Could not reach the custom/production MongoDB. Check the Atlas hostname, "
        "DNS, network access list, and connectivity."
    )


async def create_administrator(
    target: DatabaseTarget,
    *,
    input_fn: Callable[[str], str] = input,
    getpass_fn: Callable[[str], str] = getpass,
    client_factory=AsyncIOMotorClient,
) -> str:
    """Connect, collect validated credentials, and insert one administrator."""
    client = None
    try:
        client = client_factory(target.mongodb_url, **CLIENT_OPTIONS)
        database = client[target.database_name]
        await client.admin.command("ping")

        details = prompt_administrator_details(
            input_fn=input_fn,
            getpass_fn=getpass_fn,
        )
        if await database.users.find_one({"email": details.email}):
            raise OperatorError("An account with that email already exists")

        result = await database.users.insert_one(
            {
                "email": details.email,
                "full_name": details.full_name,
                "hashed_password": hash_password(details.password),
                "role": RoleEnum.ADMIN.value,
                "status": "active",
                "force_password_change": False,
                "token_version": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        return str(result.inserted_id)
    except OperatorError:
        raise
    except DuplicateKeyError as exc:
        raise OperatorError("An account with that email already exists") from exc
    except OperationFailure as exc:
        details = exc.details if isinstance(exc.details, dict) else {}
        if exc.code == 18 or "auth" in str(details.get("codeName", "")).lower():
            raise OperatorError(
                "MongoDB authentication failed. Check the supplied username and password."
            ) from exc
        raise OperatorError(
            "MongoDB rejected the operation. Check the account's database permissions."
        ) from exc
    except (InvalidURI, InvalidName, ValueError) as exc:
        raise OperatorError("MongoDB URL or database name is malformed") from exc
    except ConfigurationError as exc:
        if target.is_local:
            message = "MongoDB configuration is invalid. Check MONGODB_URL in backend/.env."
        else:
            message = (
                "Could not resolve or configure the custom/production MongoDB. "
                "Check the Atlas hostname, URI format, and DNS."
            )
        raise OperatorError(message) from exc
    except (ServerSelectionTimeoutError, AutoReconnect, ConnectionFailure) as exc:
        raise OperatorError(_connection_error(target)) from exc
    except PyMongoError as exc:
        raise OperatorError(
            "MongoDB operation failed. Check connectivity and database permissions."
        ) from exc
    finally:
        if client is not None:
            client.close()


class SafeArgumentParser(argparse.ArgumentParser):
    """Avoid repeating potentially sensitive invalid arguments in errors."""

    def error(self, _message: str) -> None:
        self.print_usage(sys.stderr)
        self.exit(2, "create_admin.py: error: invalid command-line arguments\n")


def _parser() -> argparse.ArgumentParser:
    parser = SafeArgumentParser(
        allow_abbrev=False,
        description="Create an administrator against an explicitly selected MongoDB target."
    )
    target_group = parser.add_mutually_exclusive_group()
    target_group.add_argument(
        "--local",
        action="store_const",
        const="local",
        dest="mode",
        help="use the localhost MongoDB configured by the backend environment",
    )
    target_group.add_argument(
        "--custom",
        action="store_const",
        const="custom",
        dest="mode",
        help="securely prompt for a custom or production MongoDB URL",
    )
    return parser


def main(
    argv: Sequence[str] | None = None,
    *,
    input_fn: Callable[[str], str] = input,
    getpass_fn: Callable[[str], str] = getpass,
    client_factory=AsyncIOMotorClient,
) -> int:
    args = _parser().parse_args(argv)
    try:
        target = prompt_database_target(
            args.mode,
            input_fn=input_fn,
            getpass_fn=getpass_fn,
        )
        print_target_summary(target)
        if input_fn("\nContinue? [y/N]: ").strip().lower() not in {"y", "yes"}:
            print("Cancelled; no changes were made.")
            return 0

        inserted_id = asyncio.run(
            create_administrator(
                target,
                input_fn=input_fn,
                getpass_fn=getpass_fn,
                client_factory=client_factory,
            )
        )
    except OperatorError as exc:
        print(f"Error: {exc}")
        return 1
    except (EOFError, KeyboardInterrupt):
        print("\nCancelled; no changes were made.")
        return 130
    except Exception:
        # Do not expose driver exceptions: they can contain a complete URI.
        print(
            "Error: administrator creation failed unexpectedly; "
            "no connection details were shown."
        )
        return 1

    print(f"Created administrator {inserted_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
