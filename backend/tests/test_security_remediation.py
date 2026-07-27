"""Regression tests for vulnerabilities fixed during the public-repo review."""

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError
from unittest.mock import AsyncMock, MagicMock, patch

from core.security import (
    create_access_token,
    get_current_user,
    get_current_user_for_password_change,
    verify_ingest_api_key,
    verify_token,
)
from models.user import RoleEnum, UserIn
from routes.maintenance import get_backup_path


def test_access_tokens_include_issued_and_expiry_claims():
    token = create_access_token(
        {
            "sub": "analyst@example.com",
            "user_id": "507f1f77bcf86cd799439011",
            "role": RoleEnum.ANALYST.value,
        }
    )
    payload = verify_token(token)
    assert payload is not None
    assert payload["iat"] < payload["exp"]


def test_ingestion_rejects_incorrect_key():
    with pytest.raises(HTTPException) as exc:
        verify_ingest_api_key("incorrect-key")
    assert exc.value.status_code == 401


def test_backup_path_rejects_traversal():
    with pytest.raises(HTTPException) as exc:
        get_backup_path("../../outside.json.gz")
    assert exc.value.status_code == 400


def test_public_registration_rejects_administrator_role():
    with pytest.raises(ValidationError):
        UserIn(
            email="attacker@example.com",
            password="StrongPass123!",
            full_name="Example User",
            role=RoleEnum.ADMIN,
        )


def _credentials_for(role: str = RoleEnum.ADMIN.value):
    token = create_access_token(
        {
            "sub": "user@example.com",
            "user_id": "507f1f77bcf86cd799439011",
            "role": role,
            "ver": 0,
        }
    )
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


@pytest.mark.asyncio
async def test_authorization_uses_live_database_role():
    collection = MagicMock()
    collection.find_one = AsyncMock(
        return_value={
            "status": "active",
            "role": RoleEnum.ANALYST.value,
            "token_version": 0,
        }
    )
    fake_db = MagicMock()
    fake_db.__getitem__.return_value = collection

    with patch("database.db", fake_db):
        current_user = await get_current_user(_credentials_for())

    assert current_user["role"] == RoleEnum.ANALYST.value


@pytest.mark.asyncio
async def test_forced_password_change_blocks_normal_authorization():
    collection = MagicMock()
    collection.find_one = AsyncMock(
        return_value={
            "status": "active",
            "role": RoleEnum.ANALYST.value,
            "token_version": 0,
            "force_password_change": True,
        }
    )
    fake_db = MagicMock()
    fake_db.__getitem__.return_value = collection
    credentials = _credentials_for(RoleEnum.ANALYST.value)

    with patch("database.db", fake_db):
        with pytest.raises(HTTPException) as exc:
            await get_current_user(credentials)
        password_change_user = await get_current_user_for_password_change(credentials)

    assert exc.value.status_code == 403
    assert password_change_user["user_id"] == "507f1f77bcf86cd799439011"
