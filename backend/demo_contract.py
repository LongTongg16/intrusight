"""Shared ownership and identity rules for the deterministic demo corpus."""

from hashlib import sha256

from bson import ObjectId


PROVENANCE = "replayed-fixture"

# IDs describe stable fixture slots rather than payload contents. A corrected
# fixture therefore updates its owned record instead of leaving an obsolete
# hash-addressed record behind.
FIXTURE_IDS_BY_ENGINE = {
    "suricata": tuple(f"suricata-{index:03}" for index in range(1, 5)),
    "snort": tuple(f"snort-{index:03}" for index in range(1, 5)),
    "zeek": tuple(f"zeek-{index:03}" for index in range(1, 8)),
    "kismet": tuple(f"kismet-{index:03}" for index in range(1, 7)),
}

ALL_FIXTURE_IDS = frozenset(
    fixture_id
    for fixture_ids in FIXTURE_IDS_BY_ENGINE.values()
    for fixture_id in fixture_ids
)

FIXTURE_ENGINE = {
    fixture_id: engine.upper()
    for engine, fixture_ids in FIXTURE_IDS_BY_ENGINE.items()
    for fixture_id in fixture_ids
}

EXPECTED_RECORDS = len(ALL_FIXTURE_IDS)
EXPECTED_DETECTIONS = 11
EXPECTED_OBSERVATIONS = 10

# New records are selected by an allow-list of stable IDs. The missing-ID arm
# safely includes records produced by the previous version of this same loader,
# which already carried the exclusive replayed-fixture provenance marker.
MANAGED_DEMO_QUERY = {
    "engine_context.provenance": PROVENANCE,
    "source_nids": {"$in": sorted(set(FIXTURE_ENGINE.values()))},
    "$or": [
        {"engine_context.demo_fixture_id": {"$in": sorted(ALL_FIXTURE_IDS)}},
        {"engine_context.demo_fixture_id": {"$exists": False}},
    ],
}


def fixture_object_id(fixture_id: str) -> ObjectId:
    """Map a known fixture ID onto MongoDB's always-unique `_id` namespace."""
    if fixture_id not in ALL_FIXTURE_IDS:
        raise ValueError("Unknown demo fixture ID")
    digest = sha256(f"{PROVENANCE}:{fixture_id}".encode("utf-8")).hexdigest()
    return ObjectId(digest[:24])


def summarize_demo_records(records: list[dict]) -> dict:
    """Return stable per-engine detection/observation counts."""
    engines = {
        engine: {"detections": 0, "observations": 0, "total": 0}
        for engine in FIXTURE_IDS_BY_ENGINE
    }
    fixture_ids = []
    legacy_records = 0

    for record in records:
        engine = str(record.get("source_nids", "")).lower()
        if engine not in engines:
            continue
        event_kind = record.get("event_kind", "detection")
        bucket = "observations" if event_kind == "observation" else "detections"
        engines[engine][bucket] += 1
        engines[engine]["total"] += 1

        fixture_id = (record.get("engine_context") or {}).get("demo_fixture_id")
        if fixture_id in ALL_FIXTURE_IDS:
            fixture_ids.append(fixture_id)
        else:
            legacy_records += 1

    total = sum(counts["total"] for counts in engines.values())
    detections = sum(counts["detections"] for counts in engines.values())
    observations = sum(counts["observations"] for counts in engines.values())
    unique_fixture_ids = len(set(fixture_ids))

    return {
        "engines": engines,
        "total": total,
        "detections": detections,
        "observations": observations,
        "unique_fixture_ids": unique_fixture_ids,
        "duplicate_records": max(0, len(fixture_ids) - unique_fixture_ids),
        "legacy_records": legacy_records,
        "expected_total": EXPECTED_RECORDS,
        "complete": (
            total == EXPECTED_RECORDS
            and detections == EXPECTED_DETECTIONS
            and observations == EXPECTED_OBSERVATIONS
            and unique_fixture_ids == EXPECTED_RECORDS
            and legacy_records == 0
        ),
    }
