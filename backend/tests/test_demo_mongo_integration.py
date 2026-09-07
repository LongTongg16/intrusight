"""Local MongoDB proof for deterministic demo upserts and scoped cleanup."""

import os
import sys
import uuid
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import app
from tools import demo


LOCAL_MONGODB_URL = "mongodb://localhost:27017"


def test_demo_lifecycle_against_local_mongodb():
    mongo = MongoClient(
        LOCAL_MONGODB_URL,
        serverSelectionTimeoutMS=2000,
        connectTimeoutMS=2000,
    )
    database_name = f"siemless_demo_test_{uuid.uuid4().hex}"
    collection = mongo[database_name]["alerts"]
    headers = {"X-Ingest-API-Key": os.environ["INGEST_API_KEY"]}
    records = demo.demo_records()

    try:
        mongo.admin.command("ping")
        with (
            patch("routes.alerts.get_collection", return_value=collection),
            patch("routes.alerts.get_location_from_ip", return_value=None),
            patch("routes.demo.get_collection", return_value=collection),
        ):
            api = TestClient(app)
            first = [
                api.post("/api/ingest/alerts", json=record.payload, headers=headers)
                for record in records
            ]
            second = [
                api.post("/api/ingest/alerts", json=record.payload, headers=headers)
                for record in records
            ]

            assert all(response.status_code == 201 for response in first)
            assert all(response.json()["created"] is True for response in first)
            assert all(response.status_code == 200 for response in second)
            assert all(response.json()["created"] is False for response in second)
            assert collection.count_documents({}) == 21

            status = api.get("/api/demo/status", headers=headers)
            assert status.status_code == 200
            assert status.json()["complete"] is True

            collection.insert_one(
                {
                    "source_nids": "SURICATA",
                    "event_kind": "detection",
                    "engine_context": {"provenance": "live-sensor"},
                }
            )
            cleared = api.delete("/api/demo/records", headers=headers)
            assert cleared.status_code == 200
            assert cleared.json()["removed"] == 21
            assert collection.count_documents({}) == 1
            assert collection.find_one()["engine_context"]["provenance"] == "live-sensor"
    finally:
        mongo.drop_database(database_name)
        mongo.close()
