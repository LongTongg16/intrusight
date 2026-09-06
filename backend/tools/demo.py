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
from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / ".env")

import eve_ingestor  # noqa: E402
import snort_ingestor  # noqa: E402
import zeek_ingestor  # noqa: E402
import kismet_ingestor  # noqa: E402

API_BASE = os.getenv("DEMO_API_BASE", "http://localhost:8000")
INGEST_URL = f"{API_BASE}/api/ingest/alerts"
INGEST_API_KEY = os.getenv("INGEST_API_KEY")
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


def _post(payload):
    payload = dict(payload)
    context = dict(payload.get("engine_context") or {})
    context["provenance"] = PROVENANCE
    payload["engine_context"] = context

    response = requests.post(
        INGEST_URL,
        json=payload,
        headers={"X-Ingest-API-Key": INGEST_API_KEY},
        timeout=15,
    )
    return response


def cmd_load(args):
    if not INGEST_API_KEY:
        raise SystemExit("INGEST_API_KEY must be set (backend/.env)")

    selected = [args.engine] if args.engine else list(ENGINES)
    totals = {}
    failures = []

    print("IntruSight multi-engine demonstration")
    print(f"API: {INGEST_URL}")
    print("-" * 66)

    for name in selected:
        role, loader = ENGINES[name]
        sent = 0
        kinds = {}
        for payload in loader():
            response = _post(payload)
            if response.status_code in (200, 201):
                sent += 1
                key = payload.get("observation_type") or payload["event_kind"]
                kinds[key] = kinds.get(key, 0) + 1
            else:
                failures.append(f"{name}: HTTP {response.status_code} {response.text[:120]}")
        totals[name] = sent
        breakdown = ", ".join(f"{v}x {k}" for k, v in sorted(kinds.items()))
        print(f"  {name.upper():9} {role:28} {sent:>2} records   {breakdown}")

    print("-" * 66)
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
    from services.alert_service import get_collection

    collection = get_collection()
    if collection is None:
        raise SystemExit("MongoDB is not reachable (check MONGODB_URL in backend/.env)")
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
