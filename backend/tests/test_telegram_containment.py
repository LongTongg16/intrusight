"""
Containment tests for the removed Telegram integration.

The bot identity historically associated with this project is no longer trusted,
so IntruSight must have no code path that can transmit alert data to Telegram.
These tests assert the observable properties of that removal: no route, no
outbound call during ingestion, no module-level sender, and no Telegram endpoint
string left in the application source.
"""

import os
import pathlib
import socket
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import routes.alerts as alerts_module
from core.security import create_access_token
from main import app

BACKEND_DIR = pathlib.Path(__file__).resolve().parents[1]


@pytest.fixture
def client():
    """Authenticated TestClient that also carries the ingestion key."""
    token = create_access_token({
        "sub": "analyst@example.com",
        "user_id": str(ObjectId()),
        "role": "Security Analyst",
    })
    with patch("database.db") as mock_db:
        mock_db.__getitem__.return_value.find_one = AsyncMock(
            return_value={
                "status": "active",
                "role": "Security Analyst",
                "token_version": 0,
            }
        )
        yield TestClient(
            app,
            headers={
                "Authorization": f"Bearer {token}",
                "X-Ingest-API-Key": os.environ["INGEST_API_KEY"],
            },
        )


@pytest.fixture
def sample_alert():
    """A high-severity alert: the case that previously triggered delivery."""
    return {
        "timestamp": "2024-05-13T10:30:00Z",
        "src_ip": "192.168.1.10",
        "dest_ip": "10.0.0.1",
        "signature": "SQL Injection Attempt",
        "severity": 1,
        "src_port": 54321,
        "dest_port": 443,
        "proto": "TCP",
        "category": "Web Application Attack",
        "sid": 2016400,
    }


def _application_sources():
    """Every tracked backend .py file except this test package itself."""
    for path in BACKEND_DIR.rglob("*.py"):
        parts = set(path.parts)
        if "tests" in parts or ".venv" in parts or "__pycache__" in parts:
            continue
        yield path


class TestTelegramRouteRemoved:
    def test_no_registered_route_mentions_telegram(self):
        from main import app

        paths = [getattr(route, "path", "") for route in app.routes]
        assert paths, "expected the application to register routes"
        assert not [p for p in paths if "telegram" in p.lower()]

    def test_send_telegram_endpoint_is_not_handled(self, client):
        """
        No POST handler exists for this path any more. FastAPI answers 405 rather
        than 404 because the `GET /api/alerts/{alert_id}` wildcard still matches
        the path shape; either code proves the endpoint is gone, and neither is a
        response the removed handler could have produced.
        """
        response = client.post("/api/alerts/send-telegram", json={"alert_id": "x"})
        assert response.status_code in (404, 405)


class TestTelegramSenderRemoved:
    def test_alerts_module_has_no_sender_or_token(self):
        for attribute in ("send_telegram_message", "send_telegram", "BOT_TOKEN",
                          "TelegramAlertRequest", "get_users_with_telegram_id"):
            assert not hasattr(alerts_module, attribute), attribute

    def test_no_application_source_references_the_telegram_api(self):
        offenders = [
            str(path.relative_to(BACKEND_DIR))
            for path in _application_sources()
            if "api.telegram.org" in path.read_text(encoding="utf-8")
        ]
        assert offenders == []

    def test_no_application_source_reads_a_telegram_bot_token(self):
        offenders = [
            str(path.relative_to(BACKEND_DIR))
            for path in _application_sources()
            if "TELEGRAM_BOT_TOKEN" in path.read_text(encoding="utf-8")
        ]
        assert offenders == []


class TestIngestionHasNoOutboundSideEffect:
    def test_ingesting_a_high_severity_alert_opens_no_network_connection(
        self, client, sample_alert
    ):
        """
        A severity-1 alert previously triggered automatic Telegram delivery.
        Ingestion must now complete without opening any socket.
        """
        assert sample_alert["severity"] == 1

        mock_collection = MagicMock()
        mock_collection.insert_one.return_value.inserted_id = ObjectId()

        with patch("routes.alerts.get_collection", return_value=mock_collection), \
             patch("routes.alerts.get_location_from_ip", return_value=None), \
             patch.object(socket.socket, "connect") as mock_connect:
            response = client.post("/api/ingest/alerts", json=sample_alert)

        assert response.status_code == 201
        mock_connect.assert_not_called()

    def test_ingestion_does_not_look_up_notification_recipients(
        self, client, sample_alert
    ):
        mock_collection = MagicMock()
        mock_collection.insert_one.return_value.inserted_id = ObjectId()

        with patch("routes.alerts.get_collection", return_value=mock_collection), \
             patch("routes.alerts.get_location_from_ip", return_value=None), \
             patch("services.user_service.db") as mock_users_db:
            response = client.post("/api/ingest/alerts", json=sample_alert)

        assert response.status_code == 201
        mock_users_db.users.find.assert_not_called()
