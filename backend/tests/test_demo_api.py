"""End-to-end API tests for deterministic demo ownership and idempotency."""

import copy
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo.errors import DuplicateKeyError, ServerSelectionTimeoutError

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from demo_contract import ALL_FIXTURE_IDS, PROVENANCE, fixture_object_id
from core.security import get_current_user
from main import app
from tools import demo


class InMemoryCursor(list):
    def sort(self, *_args, **_kwargs):
        return self


class InMemoryCollection:
    def __init__(self):
        self.documents = {}

    def update_one(self, query, update, upsert=False):
        object_id = query.get("_id")
        existing = self.documents.get(object_id)
        if existing is not None and any(
            dotted == "engine_context.provenance"
            and (existing.get("engine_context") or {}).get("provenance") != value
            or dotted == "engine_context.demo_fixture_id"
            and (existing.get("engine_context") or {}).get("demo_fixture_id") != value
            for dotted, value in query.items()
            if dotted != "_id"
        ):
            if upsert:
                raise DuplicateKeyError("deterministic fixture identity collision")
            return SimpleNamespace(upserted_id=None, matched_count=0)
        created = existing is None
        if created:
            if not upsert:
                return SimpleNamespace(upserted_id=None, matched_count=0)
            existing = {"_id": object_id}
            existing.update(copy.deepcopy(update.get("$setOnInsert", {})))
            self.documents[object_id] = existing
        existing.update(copy.deepcopy(update.get("$set", {})))
        return SimpleNamespace(
            upserted_id=object_id if created else None,
            matched_count=0 if created else 1,
        )

    def insert_one(self, document):
        object_id = ObjectId()
        self.documents[object_id] = {"_id": object_id, **copy.deepcopy(document)}
        return SimpleNamespace(inserted_id=object_id)

    def find(self, query, projection):
        documents = [
            copy.deepcopy(document)
            for document in self.documents.values()
            if not query.get("engine_context.provenance")
            or self._is_managed_demo(document)
        ]
        if projection and projection.get("_id") == 0:
            for document in documents:
                document.pop("_id", None)
        return InMemoryCursor(documents)

    def delete_many(self, _query):
        deleted = 0
        for object_id, document in list(self.documents.items()):
            if self._is_managed_demo(document):
                del self.documents[object_id]
                deleted += 1
        return SimpleNamespace(deleted_count=deleted)

    @staticmethod
    def _is_managed_demo(document):
        context = document.get("engine_context") or {}
        if context.get("provenance") != PROVENANCE:
            return False
        fixture_id = context.get("demo_fixture_id")
        return fixture_id is None or fixture_id in ALL_FIXTURE_IDS


def _headers():
    return {"X-Ingest-API-Key": os.environ["INGEST_API_KEY"]}


def test_first_load_inserts_21_second_load_is_idempotent_and_clear_is_scoped():
    collection = InMemoryCollection()
    client = TestClient(app)
    records = demo.demo_records()

    with (
        patch("routes.alerts.get_collection", return_value=collection),
        patch("routes.alerts.get_location_from_ip", return_value=None),
        patch("routes.demo.get_collection", return_value=collection),
    ):
        first = [
            client.post("/api/ingest/alerts", json=record.payload, headers=_headers())
            for record in records
        ]
        assert all(response.status_code == 201 for response in first)
        assert all(response.json()["created"] is True for response in first)
        assert len(collection.documents) == 21

        app.dependency_overrides[get_current_user] = lambda: {
            "email": "analyst@example.com",
            "role": "Security Analyst",
        }
        try:
            retrieved = client.get("/api/alerts")
        finally:
            app.dependency_overrides.pop(get_current_user, None)
        assert retrieved.status_code == 200
        retrieved_records = retrieved.json()["items"]
        assert len(retrieved_records) == 21
        assert {
            record["engine_context"]["demo_fixture_id"]
            for record in retrieved_records
        } == ALL_FIXTURE_IDS
        for record in retrieved_records:
            if record["event_kind"] == "observation":
                assert record["severity"] is None
                assert record["severity_label"] is None

        second = [
            client.post("/api/ingest/alerts", json=record.payload, headers=_headers())
            for record in records
        ]
        assert all(response.status_code == 200 for response in second)
        assert all(response.json()["created"] is False for response in second)
        assert len(collection.documents) == 21

        status = client.get("/api/demo/status", headers=_headers())
        assert status.status_code == 200
        body = status.json()
        assert body["complete"] is True
        assert body["total"] == 21
        assert body["detections"] == 11
        assert body["observations"] == 10

        unrelated_id = ObjectId()
        collection.documents[unrelated_id] = {
            "_id": unrelated_id,
            "source_nids": "SURICATA",
            "event_kind": "detection",
            "engine_context": {"provenance": "live-sensor"},
        }
        unknown_fixture_id = ObjectId()
        collection.documents[unknown_fixture_id] = {
            "_id": unknown_fixture_id,
            "source_nids": "SURICATA",
            "event_kind": "detection",
            "engine_context": {
                "provenance": PROVENANCE,
                "demo_fixture_id": "unrecognized-fixture",
            },
        }
        cleared = client.delete("/api/demo/records", headers=_headers())
        assert cleared.status_code == 200
        assert cleared.json()["removed"] == 21
        assert set(collection.documents) == {unrelated_id, unknown_fixture_id}


def test_demo_management_endpoints_require_ingest_authentication():
    collection = InMemoryCollection()
    with patch("routes.demo.get_collection", return_value=collection):
        client = TestClient(app)
        assert client.get("/api/demo/status").status_code == 401
        assert client.delete("/api/demo/records").status_code == 401


def test_demo_management_endpoints_redact_database_failures():
    marker = "do-not-expose-driver-details"

    class UnreachableCollection:
        def find(self, *_args, **_kwargs):
            raise ServerSelectionTimeoutError(marker)

        def delete_many(self, *_args, **_kwargs):
            raise ServerSelectionTimeoutError(marker)

    with patch("routes.demo.get_collection", return_value=UnreachableCollection()):
        client = TestClient(app)
        status = client.get("/api/demo/status", headers=_headers())
        cleared = client.delete("/api/demo/records", headers=_headers())

    assert status.status_code == 503
    assert cleared.status_code == 503
    assert marker not in status.text
    assert marker not in cleared.text


def test_unknown_or_mismatched_fixture_identity_is_rejected():
    collection = InMemoryCollection()
    client = TestClient(app)
    payload = copy.deepcopy(demo.demo_records("suricata")[0].payload)

    with patch("routes.alerts.get_collection", return_value=collection):
        payload["engine_context"]["demo_fixture_id"] = "unknown-999"
        unknown = client.post("/api/ingest/alerts", json=payload, headers=_headers())
        assert unknown.status_code == 422

        payload["engine_context"]["demo_fixture_id"] = "zeek-001"
        mismatch = client.post("/api/ingest/alerts", json=payload, headers=_headers())
        assert mismatch.status_code == 422

    assert collection.documents == {}


def test_demo_corpus_mapping_invariants_for_all_21_records():
    records = demo.demo_records()
    payloads = [record.payload for record in records]

    assert len(payloads) == 21
    assert len({record.fixture_id for record in records}) == 21
    assert sum(p["event_kind"] == "detection" for p in payloads) == 11
    assert sum(p["event_kind"] == "observation" for p in payloads) == 10
    assert {
        engine: sum(record.engine == engine for record in records)
        for engine in demo.ENGINES
    } == {"suricata": 4, "snort": 4, "zeek": 7, "kismet": 6}

    for record in records:
        payload = record.payload
        context = payload["engine_context"]
        assert context["provenance"] == PROVENANCE
        assert context["demo_fixture_id"] == record.fixture_id
        assert payload["source_nids"] == record.engine.upper()
        if payload["event_kind"] == "observation":
            assert payload["severity"] is None
            assert payload.get("sid") is None

    suricata = [record.payload for record in records if record.engine == "suricata"]
    assert all(payload["event_kind"] == "detection" for payload in suricata)
    assert all(payload["sid"] for payload in suricata)
    assert all(payload["engine_context"].get("rule_gid") == 1 for payload in suricata)

    snort = [record.payload for record in records if record.engine == "snort"]
    assert all(payload["event_kind"] == "detection" for payload in snort)
    assert all(payload["engine_context"]["lab_rule"] is True for payload in snort)
    assert all(payload["engine_context"]["rule"] for payload in snort)

    zeek = [record.payload for record in records if record.engine == "zeek"]
    assert sum(payload["event_kind"] == "detection" for payload in zeek) == 1
    assert sum(payload["event_kind"] == "observation" for payload in zeek) == 6
    assert all(payload["asset_kind"] == "ip" for payload in zeek)

    kismet = [record.payload for record in records if record.engine == "kismet"]
    assert sum(payload["event_kind"] == "detection" for payload in kismet) == 2
    assert sum(payload["event_kind"] == "observation" for payload in kismet) == 4
    for payload in kismet:
        assert payload["asset_kind"] == "mac"
        assert payload["src_ip"] is None
        assert payload["dest_ip"] is None
        assert ":" in payload["source_asset"]
        assert payload["engine_context"]
    for payload in kismet[:4]:
        assert payload["destination_asset"] is None
        assert payload["engine_context"]["sensor"] == "KISMET-LAB-01"
    for payload in kismet[4:]:
        assert payload["engine_context"]["kismet_alert_class"]


def test_demo_ingestion_never_overwrites_an_identity_collision():
    collection = InMemoryCollection()
    client = TestClient(app)
    record = demo.demo_records("suricata")[0]
    object_id = fixture_object_id(record.fixture_id)
    collection.documents[object_id] = {
        "_id": object_id,
        "id": str(object_id),
        "engine_context": {"provenance": "live-sensor"},
    }

    with patch("routes.alerts.get_collection", return_value=collection):
        response = client.post(
            "/api/ingest/alerts",
            json=record.payload,
            headers=_headers(),
        )

    assert response.status_code == 409
    assert collection.documents[object_id]["engine_context"] == {
        "provenance": "live-sensor"
    }
