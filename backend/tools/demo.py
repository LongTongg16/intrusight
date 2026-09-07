#!/usr/bin/env python3
"""Production-safe operator CLI for the deterministic IntruSight demo corpus."""

import argparse
import json
import os
import re
import sys
import time
import warnings
from dataclasses import dataclass, field
from getpass import GetPassWarning, getpass
from pathlib import Path
from typing import Callable, Sequence
from urllib.parse import urlsplit, urlunsplit


# Capture true process overrides before the ingestor modules load backend/.env.
# This matters for custom mode: a local file must never silently choose a
# production API or provide its credential.
PROCESS_DEMO_API_BASE = os.environ.get("DEMO_API_BASE")
PROCESS_INGEST_API_KEY = os.environ.get("INGEST_API_KEY")

BACKEND = Path(__file__).resolve().parent.parent
REPO = BACKEND.parent
sys.path.insert(0, str(BACKEND))

import requests  # noqa: E402

from config import (  # noqa: E402
    IngestKeyError,
    load_backend_env,
    resolve_ingest_api_key,
    validate_ingest_api_key,
)
from demo_contract import (  # noqa: E402
    EXPECTED_DETECTIONS,
    EXPECTED_OBSERVATIONS,
    EXPECTED_RECORDS,
    FIXTURE_IDS_BY_ENGINE,
    PROVENANCE,
)

import eve_ingestor  # noqa: E402
import kismet_ingestor  # noqa: E402
import snort_ingestor  # noqa: E402
import zeek_ingestor  # noqa: E402


LOCAL_API_BASE = "http://localhost:8000"
PRODUCTION_API_BASE = "https://intrusight.onrender.com"
FIXTURES = REPO / "demo" / "fixtures"
LOCAL_HEALTH_WAIT_SECONDS = 10
REMOTE_HEALTH_WAIT_SECONDS = 90
HEALTH_TIMEOUT = (5, 10)
REQUEST_TIMEOUT = (5, 30)
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
HOST_RE = re.compile(r"^[A-Za-z0-9.-]+$")


class OperatorError(RuntimeError):
    """A concise error safe to show without leaking credentials."""


@dataclass(frozen=True)
class ApiTarget:
    mode: str
    api_base: str
    ingest_api_key: str = field(repr=False)
    is_local: bool = False

    @property
    def ingest_url(self) -> str:
        return f"{self.api_base}/api/ingest/alerts"


@dataclass(frozen=True)
class DemoRecord:
    engine: str
    fixture_id: str
    payload: dict


def _jsonl(path: Path):
    """Yield valid JSON objects from a newline-delimited fixture."""
    with open(path, encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError as exc:
                raise OperatorError(
                    f"Invalid JSON in demo fixture {path.name} at line {line_number}"
                ) from exc


def _json_array(path: Path):
    try:
        with open(path, encoding="utf-8") as handle:
            value = json.load(handle)
    except json.JSONDecodeError as exc:
        raise OperatorError(f"Invalid JSON in demo fixture {path.name}") from exc
    if not isinstance(value, list):
        raise OperatorError(f"Demo fixture {path.name} must contain a JSON array")
    return value


def load_suricata():
    """Map the four Suricata alert fixtures through the real ingestor."""
    for event in _jsonl(FIXTURES / "suricata" / "eve-alerts.json"):
        if event.get("event_type") == "alert":
            yield eve_ingestor.build_payload(event)


def load_snort():
    """Map the four Snort lab-rule fixtures through the real ingestor."""
    for event in _jsonl(FIXTURES / "snort" / "alert_json.txt"):
        yield snort_ingestor.build_payload(event)


def load_zeek():
    """Map six observations and one notice through the real Zeek ingestor."""
    for record in _jsonl(FIXTURES / "zeek" / "zeek-logs.json"):
        yield zeek_ingestor.build_payload(record)


def load_kismet():
    """Map four sightings and two WIDS alerts through the real Kismet ingestor."""
    for device in _json_array(FIXTURES / "kismet" / "kismet-devices.json"):
        yield kismet_ingestor.build_device_payload(device)
    for alert in _json_array(FIXTURES / "kismet" / "kismet-alerts.json"):
        yield kismet_ingestor.build_alert_payload(alert)


ENGINES = {
    "suricata": ("Signature detection", load_suricata),
    "snort": ("Rule-driven detection", load_snort),
    "zeek": ("Protocol / network context", load_zeek),
    "kismet": ("Wireless visibility", load_kismet),
}


def demo_records(engine: str | None = None) -> list[DemoRecord]:
    """Build and tag the selected deterministic fixture records."""
    selected = [engine] if engine else list(ENGINES)
    records = []
    for name in selected:
        payloads = list(ENGINES[name][1]())
        fixture_ids = FIXTURE_IDS_BY_ENGINE[name]
        if len(payloads) != len(fixture_ids):
            raise OperatorError(
                f"The {name} fixture produced {len(payloads)} records; "
                f"expected {len(fixture_ids)}. Nothing was sent."
            )
        for fixture_id, original in zip(fixture_ids, payloads, strict=True):
            payload = dict(original)
            context = dict(payload.get("engine_context") or {})
            context["provenance"] = PROVENANCE
            context["demo_fixture_id"] = fixture_id
            payload["engine_context"] = context
            records.append(DemoRecord(name, fixture_id, payload))
    return records


def _read_secret(prompt: str, getpass_fn: Callable[[str], str]) -> str:
    """Read hidden input and refuse getpass's potentially echoed fallback."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", GetPassWarning)
            return getpass_fn(prompt)
    except GetPassWarning as exc:
        raise OperatorError(
            "Secure hidden input is unavailable. Run this tool in an interactive terminal."
        ) from exc


def _normalize_api_base(value: str, *, require_local: bool) -> str:
    value = value.strip()
    if not value or not value.isprintable():
        raise OperatorError("API base URL is empty or malformed")
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as exc:
        raise OperatorError("API base URL is malformed") from exc
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise OperatorError("API base URL must start with http:// or https://")
    if parsed.username is not None or parsed.password is not None:
        raise OperatorError("API base URL must not contain credentials")
    if parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
        raise OperatorError("API base URL must not contain a path, query, or fragment")
    hostname = parsed.hostname.lower().rstrip(".")
    if not HOST_RE.fullmatch(hostname) and ":" not in hostname:
        raise OperatorError("API base URL contains an invalid host")
    if require_local and hostname not in LOCAL_HOSTS:
        raise OperatorError(
            "Local target is configured with a non-local API host. "
            "Choose Production / custom for a remote backend."
        )

    host_display = f"[{hostname}]" if ":" in hostname else hostname
    if port is not None:
        host_display = f"{host_display}:{port}"
    return urlunsplit((parsed.scheme, host_display, "", "", ""))


def _choose_mode(input_fn: Callable[[str], str]) -> str:
    print("Target:")
    print("  1. Local")
    print("  2. Production / custom")
    while True:
        choice = input_fn("Select target: ").strip().lower()
        if choice in {"1", "local"}:
            return "local"
        if choice in {"2", "production", "custom"}:
            return "custom"
        print("Please enter 1 for Local or 2 for Production / custom.")


def prompt_target(
    mode: str | None = None,
    *,
    input_fn: Callable[[str], str] = input,
    getpass_fn: Callable[[str], str] = getpass,
) -> ApiTarget:
    """Resolve an explicit API target and key without printing either secret."""
    selected_mode = mode or _choose_mode(input_fn)
    if selected_mode == "local":
        load_backend_env()
        api_base = _normalize_api_base(
            os.getenv("DEMO_API_BASE", LOCAL_API_BASE),
            require_local=True,
        )
        try:
            api_key = resolve_ingest_api_key()
        except IngestKeyError as exc:
            raise OperatorError(str(exc)) from exc
        return ApiTarget("local", api_base, api_key, is_local=True)

    if selected_mode == "custom":
        default_base = _normalize_api_base(
            PROCESS_DEMO_API_BASE or PRODUCTION_API_BASE,
            require_local=False,
        )
        api_input = input_fn(f"API base [{default_base}]: ").strip() or default_base
        api_base = _normalize_api_base(api_input, require_local=False)

        if PROCESS_INGEST_API_KEY:
            key_input = PROCESS_INGEST_API_KEY
            print("Using INGEST_API_KEY from the process environment.")
        else:
            key_input = _read_secret("INGEST_API_KEY: ", getpass_fn).strip()
        try:
            api_key = validate_ingest_api_key(key_input)
        except IngestKeyError as exc:
            raise OperatorError(
                f"{exc}. Enter a usable production ingestion key."
            ) from exc
        return ApiTarget("production/custom", api_base, api_key)

    raise OperatorError("Unknown API target")


def print_target_summary(target: ApiTarget) -> None:
    print("\nTarget:")
    print(f"  API: {target.api_base}")
    print(f"  Mode: {target.mode}")


def _health_error(target: ApiTarget, wait_seconds: int) -> OperatorError:
    if target.is_local:
        return OperatorError(
            "Local backend is not ready. Start FastAPI and MongoDB, then try again."
        )
    return OperatorError(
        f"The production/custom backend did not become ready within {wait_seconds} "
        "seconds. Check Render status and MongoDB connectivity."
    )


def wait_for_backend(
    target: ApiTarget,
    *,
    get_fn=requests.get,
    sleep_fn: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
    max_wait: int | None = None,
) -> None:
    """Wait for API and database readiness, including a Render cold start."""
    wait_seconds = max_wait if max_wait is not None else (
        LOCAL_HEALTH_WAIT_SECONDS if target.is_local else REMOTE_HEALTH_WAIT_SECONDS
    )
    deadline = clock() + wait_seconds
    delay = 2.0
    announced = False

    while True:
        try:
            response = get_fn(f"{target.api_base}/health", timeout=HEALTH_TIMEOUT)
        except requests.exceptions.SSLError as exc:
            raise OperatorError(
                "TLS verification failed while contacting the backend. "
                "Check the API hostname and certificate."
            ) from exc
        except (
            requests.exceptions.ConnectionError,
            requests.exceptions.Timeout,
        ):
            response = None

        if response is not None and response.status_code == 200:
            try:
                health = response.json()
            except (ValueError, TypeError):
                health = {}
            checks = health.get("checks") if isinstance(health, dict) else {}
            mongo_ready = isinstance(checks, dict) and checks.get("mongodb") == "reachable"
            if isinstance(health, dict) and health.get("ok") is True and (
                health.get("ready") is True or mongo_ready
            ):
                return

        now = clock()
        if now >= deadline:
            raise _health_error(target, wait_seconds)
        if not announced:
            print("Backend is waking up...")
            announced = True
        pause = min(delay, max(0.0, deadline - now))
        sleep_fn(pause)
        delay = min(delay * 1.5, 10.0)


def _response_error(response, *, operation: str) -> OperatorError:
    status = response.status_code
    if status in {401, 403}:
        return OperatorError(
            "The backend rejected INGEST_API_KEY. Check that it matches the "
            "running backend configuration."
        )
    if status == 422:
        return OperatorError(
            f"The backend rejected an invalid demo payload during {operation}."
        )
    if status == 409:
        return OperatorError(
            "A deterministic demo fixture identity conflicts with an existing record. "
            "No record was overwritten; wait briefly and run load again."
        )
    if status == 503:
        return OperatorError(
            "The backend or MongoDB is unavailable. Wait for readiness and try again."
        )
    if status >= 500:
        return OperatorError(
            f"The backend returned HTTP {status} during {operation}. No details were exposed."
        )
    return OperatorError(f"The backend returned HTTP {status} during {operation}.")


def _request(
    target: ApiTarget,
    method: str,
    path: str,
    *,
    operation: str,
    payload: dict | None = None,
):
    requester = getattr(requests, method.lower())
    try:
        response = requester(
            f"{target.api_base}{path}",
            json=payload,
            headers={"X-Ingest-API-Key": target.ingest_api_key},
            timeout=REQUEST_TIMEOUT,
        )
    except requests.exceptions.SSLError as exc:
        raise OperatorError(
            "TLS verification failed while contacting the backend. "
            "Check the API hostname and certificate."
        ) from exc
    except requests.exceptions.ReadTimeout as exc:
        raise OperatorError(
            f"The backend timed out during {operation}. The operation can be run again safely."
        ) from exc
    except requests.exceptions.ConnectionError as exc:
        message = (
            "Could not reach the local backend. Start FastAPI and try again."
            if target.is_local
            else "Could not reach the production/custom backend. Check DNS and connectivity."
        )
        raise OperatorError(message) from exc
    except requests.exceptions.Timeout as exc:
        raise OperatorError(f"The backend timed out during {operation}.") from exc
    if response.status_code not in {200, 201}:
        raise _response_error(response, operation=operation)
    return response


def _post_record(target: ApiTarget, record: DemoRecord) -> dict:
    """Post once, retrying one uncertain read timeout through idempotent storage."""
    for attempt in range(2):
        try:
            response = requests.post(
                target.ingest_url,
                json=record.payload,
                headers={"X-Ingest-API-Key": target.ingest_api_key},
                timeout=REQUEST_TIMEOUT,
            )
        except requests.exceptions.ReadTimeout as exc:
            if attempt == 0:
                print(
                    f"  {record.fixture_id}: response timed out; "
                    "checking again with the same idempotency key..."
                )
                continue
            raise OperatorError(
                f"The backend timed out twice while loading {record.fixture_id}. "
                "Run load again; deterministic IDs prevent duplicates."
            ) from exc
        except requests.exceptions.SSLError as exc:
            raise OperatorError(
                "TLS verification failed while loading the demo. "
                "Check the API hostname and certificate."
            ) from exc
        except requests.exceptions.ConnectionError as exc:
            message = (
                "The local backend stopped responding during demo loading."
                if target.is_local
                else "The production/custom backend stopped responding. Check DNS and connectivity."
            )
            raise OperatorError(message) from exc
        except requests.exceptions.Timeout as exc:
            raise OperatorError(
                f"The backend timed out while loading {record.fixture_id}. "
                "Run load again safely."
            ) from exc

        if response.status_code not in {200, 201}:
            raise _response_error(response, operation=f"loading {record.fixture_id}")
        try:
            body = response.json()
        except (ValueError, TypeError) as exc:
            raise OperatorError(
                f"The backend returned an invalid response for {record.fixture_id}."
            ) from exc
        if (
            not isinstance(body, dict)
            or not isinstance(body.get("created"), bool)
            or body.get("demo_fixture_id") != record.fixture_id
        ):
            raise OperatorError(
                "The backend does not support deterministic demo ingestion. "
                "Deploy the matching backend version before loading records."
            )
        return body

    raise OperatorError("Demo loading failed unexpectedly")


def cmd_load(target: ApiTarget, engine: str | None = None) -> int:
    records = demo_records(engine)
    # Authenticate and verify the target exposes the matching demo-management
    # contract before sending anything. This prevents an older deployment from
    # accepting the payloads without applying their deterministic identities.
    preflight = _status(target)
    legacy = int(preflight.get("legacy_records", 0))
    duplicates = int(preflight.get("duplicate_records", 0))
    if legacy or duplicates:
        raise OperatorError(
            "The target contains legacy or duplicate replayed-fixture records. "
            "Run demo.py clear against this same target before loading; no records were sent."
        )
    expected = len(records)
    created = 0
    existing = 0
    by_engine = {}

    for record in records:
        result = _post_record(target, record)
        if result["created"]:
            created += 1
        else:
            existing += 1
        counts = by_engine.setdefault(
            record.engine,
            {"detections": 0, "observations": 0},
        )
        bucket = (
            "observations"
            if record.payload.get("event_kind") == "observation"
            else "detections"
        )
        counts[bucket] += 1

    for name in ([engine] if engine else ENGINES):
        counts = by_engine.get(name, {"detections": 0, "observations": 0})
        print(
            f"{name.title():9} "
            f"{counts['detections']} detection(s), "
            f"{counts['observations']} observation(s)"
        )
    print(f"\nProcessed {expected} records: {created} inserted, {existing} already present.")
    return 0


def _status(target: ApiTarget) -> dict:
    response = _request(
        target,
        "get",
        "/api/demo/status",
        operation="checking demo status",
    )
    try:
        status = response.json()
    except (ValueError, TypeError) as exc:
        raise OperatorError("The backend returned an invalid demo status response.") from exc
    if not isinstance(status, dict) or not isinstance(status.get("engines"), dict):
        raise OperatorError("The backend returned an invalid demo status response.")
    return status


def _noun(count: int, singular: str, plural: str | None = None) -> str:
    return singular if count == 1 else (plural or f"{singular}s")


def print_status(status: dict) -> None:
    engines = status["engines"]
    for name in ENGINES:
        counts = engines.get(name, {})
        detections = int(counts.get("detections", 0))
        observations = int(counts.get("observations", 0))
        details = [f"{detections} {_noun(detections, 'detection')}"]
        if observations:
            details.append(f"{observations} {_noun(observations, 'observation')}")
        print(f"{name.title() + ':':10}" + ", ".join(details))

    total = int(status.get("total", 0))
    detections = int(status.get("detections", 0))
    observations = int(status.get("observations", 0))
    print(f"\nTotal:    {total} {_noun(total, 'record')}")
    print(f"          {detections} {_noun(detections, 'detection')}")
    print(f"          {observations} {_noun(observations, 'observation')}")

    if not status.get("complete", False):
        print(
            f"\nCorpus is not complete (expected {EXPECTED_RECORDS} records: "
            f"{EXPECTED_DETECTIONS} detections and {EXPECTED_OBSERVATIONS} observations)."
        )
    duplicates = int(status.get("duplicate_records", 0))
    legacy = int(status.get("legacy_records", 0))
    if duplicates:
        print(f"Warning: {duplicates} duplicate fixture record(s) are present.")
    if legacy:
        print(f"Legacy replayed-fixture records present: {legacy}.")


def cmd_status(target: ApiTarget) -> int:
    print_status(_status(target))
    return 0


def cmd_clear(target: ApiTarget, *, input_fn: Callable[[str], str] = input) -> int:
    status = _status(target)
    count = int(status.get("total", 0))
    if count == 0:
        print("No replayed-fixture demo records to remove.")
        return 0

    print(
        f"This will remove {count} replayed-fixture demo "
        f"{_noun(count, 'record')} from:\n  API: {target.api_base}"
    )
    if input_fn("Continue? [y/N]: ").strip().lower() not in {"y", "yes"}:
        print("Cancelled; no changes were made.")
        return 0

    response = _request(
        target,
        "delete",
        "/api/demo/records",
        operation="clearing demo records",
    )
    try:
        removed = int(response.json().get("removed", 0))
    except (AttributeError, TypeError, ValueError) as exc:
        raise OperatorError("The backend returned an invalid clear response.") from exc
    print(f"Removed {removed} replayed-fixture demo {_noun(removed, 'record')}.")
    print("Non-demo records and users were not touched.")
    return 0


class SafeArgumentParser(argparse.ArgumentParser):
    """Do not echo potentially sensitive unexpected arguments."""

    def error(self, _message: str) -> None:
        self.print_usage(sys.stderr)
        self.exit(2, "demo.py: error: invalid command-line arguments\n")


def _add_target_flags(parser: argparse.ArgumentParser) -> None:
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--local", action="store_const", const="local", dest="mode")
    group.add_argument("--custom", action="store_const", const="custom", dest="mode")


def _parser() -> argparse.ArgumentParser:
    parser = SafeArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        allow_abbrev=False,
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    load_parser = subparsers.add_parser(
        "load",
        help="idempotently replay recorded engine output through the API",
        allow_abbrev=False,
    )
    _add_target_flags(load_parser)
    load_parser.add_argument("--engine", choices=sorted(ENGINES))

    status_parser = subparsers.add_parser(
        "status",
        help="summarize replayed-fixture records through the API",
        allow_abbrev=False,
    )
    _add_target_flags(status_parser)

    clear_parser = subparsers.add_parser(
        "clear",
        help="remove only replayed-fixture records through the API",
        allow_abbrev=False,
    )
    _add_target_flags(clear_parser)
    return parser


def main(
    argv: Sequence[str] | None = None,
    *,
    input_fn: Callable[[str], str] = input,
    getpass_fn: Callable[[str], str] = getpass,
    sleep_fn: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
) -> int:
    args = _parser().parse_args(argv)
    try:
        target = prompt_target(
            args.mode,
            input_fn=input_fn,
            getpass_fn=getpass_fn,
        )
        print_target_summary(target)

        if args.command == "load":
            if input_fn("\nContinue? [y/N]: ").strip().lower() not in {"y", "yes"}:
                print("Cancelled; no changes were made.")
                return 0
            # Validate all selected fixture counts before making any request.
            demo_records(args.engine)

        wait_for_backend(target, sleep_fn=sleep_fn, clock=clock)

        if args.command == "load":
            return cmd_load(target, args.engine)
        if args.command == "status":
            return cmd_status(target)
        return cmd_clear(target, input_fn=input_fn)
    except OperatorError as exc:
        print(f"Error: {exc}")
        return 1
    except (EOFError, KeyboardInterrupt):
        print("\nCancelled; no changes were made.")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
