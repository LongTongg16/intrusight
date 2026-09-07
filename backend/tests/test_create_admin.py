"""Focused tests for the safe administrator bootstrap workflow."""

import os
import secrets
import warnings
from getpass import GetPassWarning
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from pymongo.errors import OperationFailure, ServerSelectionTimeoutError

import create_admin
from core import security


TEST_URI_PASSWORD = secrets.token_hex(12)
DRIVER_SECRET = secrets.token_hex(12)
CUSTOM_URI = (
    f"mongodb+srv://bootstrap-user:{TEST_URI_PASSWORD}@"
    "intrusight.example.mongodb.net/?retryWrites=true&w=majority"
)
ADMIN_PASSWORD = f"Aa1!{secrets.token_hex(12)}"


def _input_from(values):
    answers = iter(values)
    return lambda _prompt: next(answers)


def _getpass_from(values):
    answers = iter(values)
    return lambda _prompt: next(answers)


def _fake_client(*, existing_user=None, ping_error=None, insert_error=None):
    collection = SimpleNamespace(
        find_one=AsyncMock(return_value=existing_user),
        insert_one=AsyncMock(
            return_value=SimpleNamespace(inserted_id="admin-id")
        ),
    )
    if insert_error:
        collection.insert_one.side_effect = insert_error

    admin = SimpleNamespace(command=AsyncMock(return_value={"ok": 1}))
    if ping_error:
        admin.command.side_effect = ping_error

    database = SimpleNamespace(users=collection)

    class FakeClient:
        def __init__(self):
            self.admin = admin
            self.close = Mock()

        def __getitem__(self, _database_name):
            return database

    client = FakeClient()
    factory = Mock(return_value=client)
    return factory, client, collection


def test_interactive_local_selection_uses_backend_environment(monkeypatch):
    loader = Mock()
    monkeypatch.setattr(create_admin, "load_backend_env", loader)
    monkeypatch.setenv("MONGODB_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DATABASE_NAME", "local_admin_test")

    target = create_admin.prompt_database_target(
        input_fn=_input_from(["1"]),
        getpass_fn=Mock(side_effect=AssertionError("URI prompt should not run")),
    )

    loader.assert_called_once_with()
    assert target.environment == "local"
    assert target.database_name == "local_admin_test"
    assert target.hosts == ("localhost:27017",)
    assert target.mongodb_url == "mongodb://localhost:27017"


def test_local_selection_rejects_a_remote_configured_host(monkeypatch):
    monkeypatch.setattr(create_admin, "load_backend_env", Mock())
    monkeypatch.setenv("MONGODB_URL", CUSTOM_URI)

    with pytest.raises(create_admin.OperatorError, match="non-local MongoDB host"):
        create_admin.prompt_database_target("local")


def test_custom_selection_uses_hidden_uri_and_does_not_change_environment(monkeypatch):
    prior_uri = os.environ.get("MONGODB_URL")
    hidden_prompt = Mock(return_value=CUSTOM_URI)
    loader = Mock()
    monkeypatch.setattr(create_admin, "load_backend_env", loader)

    target = create_admin.prompt_database_target(
        "custom",
        input_fn=_input_from(["production_db"]),
        getpass_fn=hidden_prompt,
    )

    hidden_prompt.assert_called_once_with("MongoDB URL: ")
    loader.assert_not_called()
    assert target.environment == "custom/production"
    assert target.database_name == "production_db"
    assert target.hosts == ("intrusight.example.mongodb.net",)
    assert target.mongodb_url == CUSTOM_URI
    assert os.environ.get("MONGODB_URL") == prior_uri


def test_bootstrap_and_application_share_the_password_hashing_helper():
    assert create_admin.hash_password is security.hash_password


def test_invalid_command_line_arguments_are_not_echoed(capsys):
    with pytest.raises(SystemExit):
        create_admin._parser().parse_args(["--mongo-url", CUSTOM_URI])

    captured = capsys.readouterr()
    assert CUSTOM_URI not in captured.out
    assert CUSTOM_URI not in captured.err
    assert TEST_URI_PASSWORD not in captured.out
    assert TEST_URI_PASSWORD not in captured.err


def test_summary_displays_only_sanitized_destination(capsys):
    target = create_admin._make_target(
        CUSTOM_URI,
        "production_db",
        environment="custom/production",
        require_local=False,
    )

    create_admin.print_target_summary(target)

    output = capsys.readouterr().out
    assert "Environment: custom/production" in output
    assert "Database: production_db" in output
    assert "Host: intrusight.example.mongodb.net" in output
    assert CUSTOM_URI not in output
    assert "bootstrap-user" not in output
    assert TEST_URI_PASSWORD not in output
    assert "retryWrites" not in output


def test_password_is_hidden_from_output_and_object_repr(capsys):
    details = create_admin.prompt_administrator_details(
        input_fn=_input_from(["admin@example.com", "Admin User"]),
        getpass_fn=_getpass_from([ADMIN_PASSWORD, ADMIN_PASSWORD]),
    )

    output = capsys.readouterr().out
    assert ADMIN_PASSWORD not in output
    assert ADMIN_PASSWORD not in repr(details)


def test_getpass_echo_fallback_is_refused():
    def insecure_getpass(_prompt):
        warnings.warn("input may be echoed", GetPassWarning)
        return ADMIN_PASSWORD

    with pytest.raises(create_admin.OperatorError, match="interactive terminal"):
        create_admin.prompt_database_target(
            "custom",
            input_fn=_input_from(["siemless_db"]),
            getpass_fn=insecure_getpass,
        )


def test_cancelled_confirmation_does_not_connect_or_insert(capsys):
    client_factory = Mock(side_effect=AssertionError("client must not be created"))

    exit_code = create_admin.main(
        ["--custom"],
        input_fn=_input_from(["", ""]),
        getpass_fn=_getpass_from([CUSTOM_URI]),
        client_factory=client_factory,
    )

    assert exit_code == 0
    client_factory.assert_not_called()
    output = capsys.readouterr().out
    assert "Cancelled; no changes were made." in output
    assert CUSTOM_URI not in output
    assert TEST_URI_PASSWORD not in output


def test_successful_custom_creation_preserves_admin_fields(monkeypatch, capsys):
    factory, client, collection = _fake_client()
    monkeypatch.setattr(create_admin, "hash_password", Mock(return_value="bcrypt-hash"))

    exit_code = create_admin.main(
        ["--custom"],
        input_fn=_input_from(
            ["production_db", "yes", "ADMIN@example.com", "Admin User"]
        ),
        getpass_fn=_getpass_from([CUSTOM_URI, ADMIN_PASSWORD, ADMIN_PASSWORD]),
        client_factory=factory,
    )

    assert exit_code == 0
    factory.assert_called_once_with(CUSTOM_URI, **create_admin.CLIENT_OPTIONS)
    client.admin.command.assert_awaited_once_with("ping")
    document = collection.insert_one.await_args.args[0]
    assert document["email"] == "admin@example.com"
    assert document["full_name"] == "Admin User"
    assert document["hashed_password"] == "bcrypt-hash"
    assert document["role"] == "Administrator"
    assert document["status"] == "active"
    assert document["force_password_change"] is False
    assert document["token_version"] == 0
    assert document["created_at"]
    client.close.assert_called_once_with()
    output = capsys.readouterr().out
    assert "Created administrator admin-id" in output
    assert CUSTOM_URI not in output
    assert TEST_URI_PASSWORD not in output
    assert ADMIN_PASSWORD not in output


@pytest.mark.asyncio
async def test_duplicate_email_performs_no_insert():
    factory, _client, collection = _fake_client(existing_user={"_id": "existing"})
    target = create_admin._make_target(
        "mongodb://localhost:27017",
        "siemless_db",
        environment="local",
        require_local=True,
    )

    with pytest.raises(create_admin.OperatorError, match="already exists"):
        await create_admin.create_administrator(
            target,
            input_fn=_input_from(["admin@example.com", "Admin User"]),
            getpass_fn=_getpass_from([ADMIN_PASSWORD, ADMIN_PASSWORD]),
            client_factory=factory,
        )

    collection.insert_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_local_connection_error_is_actionable_and_redacted():
    leaked_driver_text = f"mongodb://operator:{DRIVER_SECRET}@localhost:27017"
    factory, _client, collection = _fake_client(
        ping_error=ServerSelectionTimeoutError(leaked_driver_text)
    )
    target = create_admin._make_target(
        "mongodb://localhost:27017",
        "siemless_db",
        environment="local",
        require_local=True,
    )

    with pytest.raises(create_admin.OperatorError) as exc:
        await create_admin.create_administrator(target, client_factory=factory)

    assert "Local MongoDB is unreachable" in str(exc.value)
    assert DRIVER_SECRET not in str(exc.value)
    collection.insert_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_bad_atlas_credentials_are_actionable_and_redacted():
    leaked_driver_text = (
        f"authentication failed for mongodb://user:{DRIVER_SECRET}@host"
    )
    factory, _client, collection = _fake_client(
        ping_error=OperationFailure(leaked_driver_text, code=18)
    )
    target = create_admin._make_target(
        CUSTOM_URI,
        "siemless_db",
        environment="custom/production",
        require_local=False,
    )

    with pytest.raises(create_admin.OperatorError) as exc:
        await create_admin.create_administrator(target, client_factory=factory)

    assert "authentication failed" in str(exc.value).lower()
    assert DRIVER_SECRET not in str(exc.value)
    assert TEST_URI_PASSWORD not in str(exc.value)
    collection.insert_one.assert_not_awaited()


@pytest.mark.parametrize(
    ("email", "name", "password", "confirmation", "expected"),
    [
        ("not-an-email", "Admin User", ADMIN_PASSWORD, ADMIN_PASSWORD, "email"),
        ("admin@example.com", "A", ADMIN_PASSWORD, ADMIN_PASSWORD, "Full name"),
        ("admin@example.com", "Admin User", "weak", "weak", "Password"),
        (
            "admin@example.com",
            "Admin User",
            ADMIN_PASSWORD,
            "DifferentPassword1!",
            "Passwords do not match",
        ),
    ],
)
def test_invalid_administrator_details_are_rejected(
    email, name, password, confirmation, expected
):
    with pytest.raises(create_admin.OperatorError, match=expected):
        create_admin.prompt_administrator_details(
            input_fn=_input_from([email, name]),
            getpass_fn=_getpass_from([password, confirmation]),
        )


@pytest.mark.parametrize(
    "uri",
    [
        "https://intrusight.example.mongodb.net",
        "mongodb://",
        "mongodb://host:not-a-port",
        "mongodb+srv://host.example:27017",
        "mongodb://user:unescaped/password@host.example",
    ],
)
def test_malformed_uri_is_rejected_without_echoing_it(uri):
    with pytest.raises(create_admin.OperatorError) as exc:
        create_admin._make_target(
            uri,
            "siemless_db",
            environment="custom/production",
            require_local=False,
        )

    assert uri not in str(exc.value)
