#!/usr/bin/env python3
"""
IntruSight multi-engine demonstration loader.

Replays recorded engine output through the REAL ingestor parsers and posts the
result to the running API. It does not insert rows directly and it does not
generate anything: every record in demo/fixtures/ is engine-shaped input that
the same code path handles in a live deployment.

    python3 backend/tools/demo.py load      # replay all four engines
    python3 backend/tools/demo.py load --engine zeek
    python3 backend/tools/demo.py status    # what is currently stored
    python3 backend/tools/demo.py clear     # remove only what this loader added

Every record carries provenance (`engine_context.provenance = "replayed-fixture"`)
so demonstration data is always distinguishable from live sensor output, and so
`clear` can remove exactly what it loaded and nothing else.
"""

import argparse
import json
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
REPO = BACKEND.parent
sys.path.insert(0, str(BACKEND))

import requests  # noqa: E402

# The same helper the API itself uses, so the loader and the backend can never
# resolve different credentials from the same machine. It reads backend/.env by
# absolute path (working-directory independent) and never overrides a variable
# already exported into the environment.
from config import IngestKeyError, load_backend_env, resolve_ingest_api_key  # noqa: E402

load_backend_env()

import eve_ingestor  # noqa: E402
import snort_ingestor  # noqa: E402
import zeek_ingestor  # noqa: E402
import kismet_ingestor  # noqa: E402

API_BASE = os.getenv("DEMO_API_BASE", "http://localhost:8000")
INGEST_URL = f"{API_BASE}/api/ingest/alerts"
FIXTURES = REPO / "demo" / "fixtures"

# Marks every record this loader creates. Used for cleanup and shown in the UI.
PROVENANCE = "replayed-fixture"


def _jsonl(path):
    """Yield JSON objects from a newline-delimited file."""
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue


def _json_array(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


# ── Engine scenarios ─────────────────────────────────────────────────────────
# Each entry states what the engine contributes and how its recorded output is
# turned into shared records, using that engine's own ingestor.

def load_suricata():
    """Signature detection: Emerging-Threats-style rules matching lab traffic."""
    for event in _jsonl(FIXTURES / "suricata" / "eve-alerts.json"):
        # The ingestor's own filter decides what counts as an alert; the flow
        # record in the fixture is skipped by it, exactly as in production.
        if event.get("event_type") != "alert":
            continue
        yield eve_ingestor.build_payload(event)


def load_snort():
    """Rule-driven detection: local lab rules from demo/rules/intrusight-lab.rules."""
    for event in _jsonl(FIXTURES / "snort" / "alert_json.txt"):
        yield snort_ingestor.build_payload(event)


def load_zeek():
    """Protocol/network context: conn, dns, ssl, http observations plus one notice."""
    for record in _jsonl(FIXTURES / "zeek" / "zeek-logs.json"):
        yield zeek_ingestor.build_payload(record)


def load_kismet():
    """Wireless visibility: device/AP sightings plus Kismet's own WIDS alerts."""
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


def _post(payload, api_key):
    payload = dict(payload)
    context = dict(payload.get("engine_context") or {})
    context["provenance"] = PROVENANCE
    payload["engine_context"] = context

    return requests.post(
        INGEST_URL,
        json=payload,
        headers={"X-Ingest-API-Key": api_key},
        timeout=15,
    )


# Guidance for the two ways a correctly-formed key can still be refused. Neither
# message contains key material.
_CREDENTIAL_HINT = (
    "The API rejected the ingestion key.\n"
    "  The key this loader read from backend/.env is not the one the running\n"
    "  backend process holds. A server keeps the value it had at startup, so a\n"
    "  backend started before backend/.env was last changed will still be using\n"
    "  the old key.\n"
    "  Restart the backend so it re-reads backend/.env, then run this again.\n"
    "  (If INGEST_API_KEY is exported in the backend's shell, that export wins\n"
    "  over backend/.env — unset it or make the two match.)"
)

_UNCONFIGURED_HINT = (
    "The API reports that alert ingestion is not configured.\n"
    "  The backend process has no usable INGEST_API_KEY. Set one in\n"
    "  backend/.env and restart the backend."
)


def cmd_load(args):
    # Resolve and sanity-check the credential before sending anything, so a
    # misconfiguration reports once instead of as 21 identical failures.
    try:
        api_key = resolve_ingest_api_key()
    except IngestKeyError as exc:
        raise SystemExit(f"\n{exc}\n") from exc

    selected = [args.engine] if args.engine else list(ENGINES)
    totals = {}
    failures = []
    credential_error = None

    print("IntruSight multi-engine demonstration")
    print(f"API: {INGEST_URL}")
    print("-" * 66)

    for name in selected:
        role, loader = ENGINES[name]
        sent = 0
        kinds = {}
        for payload in loader():
            response = _post(payload, api_key)
            if response.status_code in (200, 201):
                sent += 1
                key = payload.get("observation_type") or payload["event_kind"]
                kinds[key] = kinds.get(key, 0) + 1
            elif response.status_code in (401, 403):
                credential_error = _CREDENTIAL_HINT
                break
            elif response.status_code == 503 and "not configured" in response.text:
                credential_error = _UNCONFIGURED_HINT
                break
            else:
                failures.append(f"{name}: HTTP {response.status_code} {response.text[:120]}")
        totals[name] = sent
        breakdown = ", ".join(f"{v}x {k}" for k, v in sorted(kinds.items()))
        print(f"  {name.upper():9} {role:28} {sent:>2} records   {breakdown}")

        if credential_error:
            break

    print("-" * 66)
    if credential_error:
        print(f"\n{credential_error}\n")
        return 1

    print(f"  loaded {sum(totals.values())} records from recorded engine output")
    if failures:
        print("\n  failures:")
        for line in failures[:10]:
            print(f"    {line}")
        return 1
    print("\n  Open the analyst dashboard and filter by engine to compare roles.")
    print("  Remove this data again with:  python3 backend/tools/demo.py clear")
    return 0


def _collection():
    """
    The alert collection, via the backend's own helper.

    status/clear talk to the store directly instead of through HTTP. That keeps
    a destructive "delete alerts" route off the authenticated web API — this is
    an operator tool that runs beside the backend, not something exposed to a
    browser.
    """
    from pymongo.errors import PyMongoError
    from services.alert_service import get_collection

    collection = get_collection()
    if collection is None:
        raise SystemExit(
            "\nMONGODB_URL is not configured.\n"
            "  Set it in backend/.env and try again.\n"
        )

    # get_collection() only builds a client; PyMongo connects lazily, so an
    # unreachable server does not surface until the first real operation. Probe
    # once here so `status` and `clear` report the same clear message that
    # `load` gives for a bad credential, instead of a driver traceback.
    try:
        collection.database.client.admin.command("ping")
    except PyMongoError as exc:
        raise SystemExit(
            "\nMongoDB is not reachable.\n"
            "  Start it (see backend/documentation/TESTING.md for the compose file)\n"
            "  and check MONGODB_URL in backend/.env.\n"
            f"  Driver reported: {type(exc).__name__}\n"
        ) from exc

    return collection


def cmd_status(args):
    collection = _collection()
    total = collection.count_documents({})
    demo_query = {"engine_context.provenance": PROVENANCE}
    demo_total = collection.count_documents(demo_query)

    print(f"stored records: {total}   (from this demo loader: {demo_total})")
    print("-" * 66)

    for engine in ENGINES:
        rows = list(collection.find(
            {**demo_query, "source_nids": engine.upper()},
            {"_id": 0, "event_kind": 1, "observation_type": 1},
        ))
        if not rows:
            continue
        detections = sum(1 for r in rows if r.get("event_kind", "detection") == "detection")
        kinds = {}
        for r in rows:
            key = r.get("observation_type")
            if key:
                kinds[key] = kinds.get(key, 0) + 1
        detail = ", ".join(f"{v}x {k}" for k, v in sorted(kinds.items()))
        print(f"  {engine.upper():9} {len(rows):>2} records   "
              f"{detections} detection(s), {len(rows) - detections} observation(s)"
              + (f"   [{detail}]" if detail else ""))

    if demo_total < total:
        print(f"\n  {total - demo_total} record(s) came from elsewhere and are not managed here.")
    return 0


def cmd_clear(args):
    collection = _collection()
    query = {"engine_context.provenance": PROVENANCE}
    count = collection.count_documents(query)

    if count == 0:
        print("no demonstration records to remove")
        return 0

    result = collection.delete_many(query)
    print(f"removed {result.deleted_count} demonstration record(s)")
    print("records from live sensors or any other source were not touched")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    load = sub.add_parser("load", help="replay recorded engine output into the API")
    load.add_argument("--engine", choices=sorted(ENGINES),
                      help="replay only one engine")
    load.set_defaults(func=cmd_load)

    sub.add_parser("status", help="summarise what is stored").set_defaults(func=cmd_status)
    sub.add_parser("clear", help="remove records this loader created").set_defaults(func=cmd_clear)

    args = parser.parse_args()
    raise SystemExit(args.func(args))


if __name__ == "__main__":
    main()
