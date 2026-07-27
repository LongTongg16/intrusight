"""Simplified comprehensive tests for logs management endpoints."""
import pytest
import sys
import os
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch
from bson import ObjectId

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from main import app
from core.security import create_access_token


@pytest.fixture
def client():
    """Provide TestClient for API testing."""
    with patch("database.db") as mock_db:
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


@pytest.fixture
def admin_token():
    """Create admin token."""
    return create_access_token({
        "sub": "admin@example.com",
        "user_id": str(ObjectId()),
        "role": "Administrator"
    })


@pytest.fixture
def sample_log_source():
    """Provide sample log source data."""
    return {
        "name": "Suricata IDS",
        "type": "file",
        "logType": "Suricata",
        "status": "Active",
        "filePath": "/var/log/suricata/eve.json"
    }


class TestCreateLog:
    """Tests for creating log sources."""

    def test_create_log_missing_name(self, client, analyst_token):
        """Test creating log fails when name is missing."""
        log_data = {
            "type": "file",
            "logType": "Suricata",
            "status": "Active"
        }

        response = client.post(
            "/api/logs",
            headers={"Authorization": f"Bearer {analyst_token}"},
            json=log_data
        )

        # Should fail due to missing required field
        assert response.status_code == 422

    def test_create_log_unauthorized(self, client, sample_log_source):
        """Test creating log without authentication."""
        response = client.post(
            "/api/logs",
            json=sample_log_source
        )

        assert response.status_code == 401
