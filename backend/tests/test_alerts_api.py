"""Comprehensive tests for alerts endpoints and functionality."""
import pytest
import sys
import os
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock, MagicMock
from datetime import datetime
from bson import ObjectId

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from main import app
from core.security import create_access_token


@pytest.fixture
def client():
    """Provide an authenticated TestClient for alert API testing."""
    user_id = str(ObjectId())
    token = create_access_token({
        "sub": "analyst@example.com",
        "user_id": user_id,
        "role": "Security Analyst"
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
def admin_token():
    """Create admin token."""
    return create_access_token({
        "sub": "admin@example.com",
        "user_id": "admin_123",
        "role": "Administrator"
    })


@pytest.fixture
def analyst_token():
    """Create analyst token."""
    return create_access_token({
        "sub": "analyst@example.com",
        "user_id": "analyst_123",
        "role": "Security Analyst"
    })


@pytest.fixture
def sample_alert():
    """Provide sample alert data."""
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
        "sid": 2016400
    }


class TestAlertIngestion:
    """Tests for alert ingestion endpoint."""

    def test_ingest_alert_success(self, client, sample_alert):
        """Test successful alert ingestion."""
        with patch('routes.alerts.get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.insert_one.return_value.inserted_id = ObjectId()
            mock_get_col.return_value = mock_collection

            with patch('routes.alerts.get_location_from_ip') as mock_geo:
                mock_geo.return_value = None

                response = client.post("/api/ingest/alerts", json=sample_alert)

                assert response.status_code == 201
                data = response.json()
                assert data["ok"] is True
                assert "id" in data

    def test_ingest_alert_no_db_connection(self, client, sample_alert):
        """Test alert ingestion fails without DB connection."""
        with patch('routes.alerts.get_collection') as mock_get_col:
            mock_get_col.return_value = None

            response = client.post("/api/ingest/alerts", json=sample_alert)

            assert response.status_code == 503
            assert "Database unavailable" in response.json()["detail"]

class TestGetAlerts:
    """Tests for retrieving alerts."""

    def test_get_all_alerts(self, client):
        """Test getting all alerts."""
        with patch('routes.alerts.get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.find.return_value.sort.return_value = [
                {
                    "id": "alert_1",
                    "timestamp": "2024-05-13T10:30:00Z",
                    "src_ip": "192.168.1.10",
                    "dest_ip": "10.0.0.1",
                    "severity": 1,
                    "status": "new"
                },
                {
                    "id": "alert_2",
                    "timestamp": "2024-05-13T11:00:00Z",
                    "src_ip": "192.168.1.20",
                    "dest_ip": "10.0.0.2",
                    "severity": 2,
                    "status": "investigating"
                }
            ]
            mock_get_col.return_value = mock_collection

            response = client.get("/api/alerts")

            assert response.status_code == 200
            data = response.json()
            assert len(data["items"]) == 2

    def test_get_alerts_filter_by_severity(self, client):
        """Test filtering alerts by severity."""
        with patch('routes.alerts.get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.find.return_value.sort.return_value = [
                {
                    "id": "alert_1",
                    "severity": 1,
                    "status": "new"
                }
            ]
            mock_get_col.return_value = mock_collection

            response = client.get("/api/alerts?severity=1")

            assert response.status_code == 200

    def test_get_alerts_filter_by_src_ip(self, client):
        """Test filtering alerts by source IP."""
        with patch('routes.alerts.get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.find.return_value.sort.return_value = [
                {
                    "id": "alert_1",
                    "src_ip": "192.168.1.10",
                    "status": "new"
                }
            ]
            mock_get_col.return_value = mock_collection

            response = client.get("/api/alerts?src_ip=192.168.1.10")

            assert response.status_code == 200

    def test_get_alerts_filter_by_status(self, client):
        """Test filtering alerts by status."""
        with patch('routes.alerts.get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.find.return_value.sort.return_value = [
                {
                    "id": "alert_1",
                    "status": "resolved"
                }
            ]
            mock_get_col.return_value = mock_collection

            response = client.get("/api/alerts?status=resolved")

            assert response.status_code == 200

    def test_get_alerts_no_db(self, client):
        """Test getting alerts without DB connection."""
        with patch('routes.alerts.get_collection') as mock_get_col:
            mock_get_col.return_value = None

            response = client.get("/api/alerts")

            assert response.status_code == 503

    def test_get_alerts_requires_authentication(self):
        """Test getting alerts requires authentication."""
        with patch('routes.alerts.get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.find.return_value.sort.return_value = []
            mock_get_col.return_value = mock_collection

            response = TestClient(app).get("/api/alerts")
            assert response.status_code == 401

    def test_ingestion_rejects_missing_api_key(self, sample_alert):
        response = TestClient(app).post("/api/ingest/alerts", json=sample_alert)
        assert response.status_code == 401


class TestAlertDetail:
    """Tests for getting alert details."""

    def test_get_alert_detail_success(self, client):
        """Test getting alert details successfully."""
        alert_id = "alert_abc123"

        with patch('routes.alerts.get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.find_one.return_value = {
                "id": alert_id,
                "timestamp": "2024-05-13T10:30:00Z",
                "src_ip": "192.168.1.10",
                "dest_ip": "10.0.0.1",
                "severity": 1,
                "signature": "SQL Injection",
                "status": "new",
                "notes": []
            }
            mock_get_col.return_value = mock_collection

            response = client.get(f"/api/alerts/{alert_id}")

            assert response.status_code == 200
            data = response.json()
            assert data["item"]["src_ip"] == "192.168.1.10"

    def test_get_alert_detail_not_found(self, client):
        """Test getting non-existent alert."""
        alert_id = "nonexistent_alert"

        with patch('routes.alerts.get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.find_one.return_value = None
            mock_get_col.return_value = mock_collection

            response = client.get(f"/api/alerts/{alert_id}")

            assert response.status_code == 404


class TestAlertStatusUpdate:
    """Tests for updating alert status."""

    def test_update_alert_status_success(self, client):
        """Test updating alert status successfully."""
        alert_id = "alert_abc123"

        with patch('routes.alerts.get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.update_one.return_value.matched_count = 1
            mock_collection.find_one.return_value = {
                "id": alert_id,
                "status": "investigating"
            }
            mock_get_col.return_value = mock_collection

            response = client.patch(
                f"/api/alerts/{alert_id}/status",
                json={"status": "investigating"}
            )

            assert response.status_code == 200
            data = response.json()
            assert data["item"]["status"] == "investigating"

    def test_update_alert_status_not_found(self, client):
        """Test updating non-existent alert."""
        alert_id = "nonexistent_alert"

        with patch('routes.alerts.get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.update_one.return_value.matched_count = 0
            mock_get_col.return_value = mock_collection

            response = client.patch(
                f"/api/alerts/{alert_id}/status",
                json={"status": "investigating"}
            )

            assert response.status_code == 404


class TestAlertNotes:
    """Tests for managing alert notes."""

    def test_get_notes(self, client):
        """Test retrieving notes from an alert."""
        alert_id = "alert_abc123"

        with patch('routes.alerts.get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.find_one.return_value = {
                "id": alert_id,
                "notes": [
                    {"text": "Note 1", "author": "Analyst 1", "role": "Security Analyst", "time": "2024-05-13"},
                    {"text": "Note 2", "author": "Analyst 2", "role": "Security Analyst", "time": "2024-05-13"}
                ]
            }
            mock_get_col.return_value = mock_collection

            response = client.get(f"/api/alerts/{alert_id}/notes")

            assert response.status_code == 200
            data = response.json()
            assert len(data["items"]) == 2


class TestAlertUpdate:
    """Tests for updating alert data."""

    def test_update_alert_fields(self, client):
        """Test updating alert fields."""
        alert_id = "alert_abc123"

        with patch('routes.alerts.get_collection') as mock_get_col:
            mock_collection = MagicMock()
            mock_collection.update_one.return_value.matched_count = 1
            mock_collection.find_one.return_value = {
                "id": alert_id,
                "dest_ip": "10.0.0.5"
            }
            mock_get_col.return_value = mock_collection

            with patch('routes.alerts.get_location_from_ip') as mock_geo:
                mock_geo.return_value = None

                response = client.patch(
                    f"/api/alerts/{alert_id}",
                    json={"dest_ip": "10.0.0.5"}
                )

                assert response.status_code == 200
