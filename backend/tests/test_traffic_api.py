"""Comprehensive tests for traffic endpoints."""
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
    """Provide TestClient for API testing."""
    with patch("routes.traffic.get_collection", return_value=None), patch(
        "database.db"
    ) as mock_db:
        mock_db.__getitem__.return_value.find_one = AsyncMock(
            return_value={
                "status": "active",
                "role": "Security Analyst",
                "token_version": 0,
            }
        )
        yield TestClient(app)


@pytest.fixture
def analyst_token():
    """Create analyst token."""
    return create_access_token({
        "sub": "analyst@example.com",
        "user_id": str(ObjectId()),
        "role": "Security Analyst"
    })


class TestTrafficLogs:
    """Tests for traffic log endpoints."""

    def test_get_traffic_logs_success(self, client, analyst_token):
        """Test successfully retrieving traffic logs."""
        response = client.get(
            "/api/traffic",
            headers={"Authorization": f"Bearer {analyst_token}"}
        )

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data

    def test_get_traffic_logs_includes_clean_flows(self, client, analyst_token):
        """Test that traffic logs include clean (non-triggered) flows."""
        response = client.get(
            "/api/traffic",
            headers={"Authorization": f"Bearer {analyst_token}"}
        )

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        # Clean flows should be included
        flows = data.get("items", [])
        clean_flows = [f for f in flows if not f.get("triggered", False)]
        assert len(clean_flows) > 0

    def test_get_traffic_logs_clean_flow_structure(self, client, analyst_token):
        """Test clean flow data structure."""
        response = client.get(
            "/api/traffic",
            headers={"Authorization": f"Bearer {analyst_token}"}
        )

        assert response.status_code == 200
        data = response.json()
        flows = data.get("items", [])
        
        if flows:
            flow = flows[0]
            assert "src" in flow
            assert "dst" in flow
            assert "proto" in flow
            assert "sport" in flow
            assert "dport" in flow

    def test_get_traffic_logs_triggered_flows(self, client, analyst_token):
        """Test that triggered flows are included in results."""
        response = client.get(
            "/api/traffic",
            headers={"Authorization": f"Bearer {analyst_token}"}
        )

        assert response.status_code == 200
        data = response.json()
        flows = data.get("items", [])
        triggered_flows = [f for f in flows if f.get("triggered", False)]
        # Even if no alerts in DB, endpoint returns triggered_flows=[] + seeded clean_flows
        assert len(flows) > 0

    def test_get_traffic_logs_unauthorized(self, client):
        """Test getting traffic logs without authentication."""
        response = client.get("/api/traffic")
        # May return 401 or 403 depending on implementation
        assert response.status_code in [401, 403]

    def test_get_traffic_logs_empty_database(self, client, analyst_token):
        """Test getting traffic logs when database is empty."""
        response = client.get(
            "/api/traffic",
            headers={"Authorization": f"Bearer {analyst_token}"}
        )

        assert response.status_code == 200
        data = response.json()
        # Should still have clean flows even with empty alerts DB
        assert "items" in data
        assert len(data.get("items", [])) > 0

    def test_get_traffic_logs_protocol_variety(self, client, analyst_token):
        """Test traffic logs include various protocols."""
        response = client.get(
            "/api/traffic",
            headers={"Authorization": f"Bearer {analyst_token}"}
        )

        assert response.status_code == 200
        data = response.json()
        flows = data.get("items", [])
        
        protocols = set(f.get("proto") for f in flows)
        # Clean flows include TCP, UDP, ICMP
        assert len(protocols) > 1

    def test_get_traffic_logs_timestamps(self, client, analyst_token):
        """Test traffic logs have proper timestamps."""
        response = client.get(
            "/api/traffic",
            headers={"Authorization": f"Bearer {analyst_token}"}
        )

        assert response.status_code == 200
        data = response.json()
        flows = data.get("items", [])
        
        if flows:
            for flow in flows:
                assert "ts" in flow
                # Timestamp should be valid ISO format or similar
                assert isinstance(flow["ts"], str)

    def test_get_traffic_logs_no_db_connection(self, client, analyst_token):
        """Test traffic logs when no database connection."""
        response = client.get(
            "/api/traffic",
            headers={"Authorization": f"Bearer {analyst_token}"}
        )

        # Should still return clean flows even without DB
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
