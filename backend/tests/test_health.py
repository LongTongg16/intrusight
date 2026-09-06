"""Health endpoint regression tests."""

import os
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

import config
from main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_backend_env_loader_uses_explicit_file_without_overriding_environment(
    monkeypatch, tmp_path
):
    env_file = tmp_path / ".env"
    env_file.write_text("INTRUSIGHT_ENV_TEST=from-file\n", encoding="utf-8")
    monkeypatch.setattr(config, "BACKEND_ENV_FILE", env_file)
    monkeypatch.setenv("INTRUSIGHT_ENV_TEST", "from-environment")

    config.load_backend_env()

    assert config.BACKEND_ENV_FILE == env_file
    assert os.getenv("INTRUSIGHT_ENV_TEST") == "from-environment"


@pytest.mark.parametrize(
    ("reachable", "ready", "database_status"),
    [
        (True, True, "reachable"),
        (False, False, "unreachable"),
    ],
)
def test_health_distinguishes_api_liveness_from_database_readiness(
    client, reachable, ready, database_status
):
    with patch("main.database_is_reachable", new=AsyncMock(return_value=reachable)):
        response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["ready"] is ready
    assert body["checks"] == {
        "api": "healthy",
        "mongodb": database_status,
    }


def test_legacy_api_health_checks_real_database_connectivity(client):
    with patch(
        "routes.alerts.database_is_reachable",
        new=AsyncMock(return_value=False),
    ):
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["mongo_connected"] is False
    assert response.json()["ready"] is False
