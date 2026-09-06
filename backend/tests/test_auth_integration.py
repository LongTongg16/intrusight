"""Real-Mongo regression coverage for the authentication lifecycle."""

import secrets
import uuid
from unittest.mock import patch

import httpx
import pytest
from motor.motor_asyncio import AsyncIOMotorClient

from core.security import verify_password
from database import MONGODB_URL
from main import app


@pytest.mark.asyncio
async def test_registration_login_and_authorization_lifecycle():
    email = f"auth-integration-{uuid.uuid4().hex}@example.com"
    submitted_email = f"  {email.upper()}  "
    password = f"Aa1!{secrets.token_hex(12)}"
    database_name = f"siemless_auth_test_{uuid.uuid4().hex}"
    mongo_client = AsyncIOMotorClient(
        MONGODB_URL,
        serverSelectionTimeoutMS=2000,
        connectTimeoutMS=2000,
    )
    test_database = mongo_client[database_name]
    users = test_database["users"]

    transport = httpx.ASGITransport(app=app)
    with (
        patch("database.db", test_database),
        patch("routes.auth.db", test_database),
        patch("services.user_service.db", test_database),
    ):
        try:
            async with httpx.AsyncClient(
                transport=transport,
                base_url="http://testserver",
            ) as client:
                registration = await client.post(
                    "/api/auth/register",
                    json={
                        "email": submitted_email,
                        "password": password,
                        "full_name": "Auth Integration Test",
                        "role": "Security Analyst",
                    },
                )
                assert registration.status_code == 201
                assert registration.json()["email"] == email
                assert registration.json()["status"] == "pending"

                stored = await users.find_one({"email": email})
                assert stored is not None
                assert stored["hashed_password"] != password
                assert stored["hashed_password"].startswith("$2b$")
                assert verify_password(password, stored["hashed_password"])

                pending_login = await client.post(
                    "/api/auth/login",
                    json={"email": submitted_email, "password": password},
                )
                assert pending_login.status_code == 403
                assert pending_login.json()["detail"] == "Account is not active"

                await users.update_one(
                    {"_id": stored["_id"]},
                    {"$set": {"status": "active"}},
                )

                login = await client.post(
                    "/api/auth/login",
                    json={"email": submitted_email, "password": password},
                )
                assert login.status_code == 200
                token = login.json()["token"]
                assert token
                assert login.json()["user"]["role"] == "Security Analyst"

                profile = await client.get(
                    "/api/users/profile",
                    headers={"Authorization": f"Bearer {token}"},
                )
                assert profile.status_code == 200
                assert profile.json()["email"] == email

                admin_only = await client.get(
                    "/api/users",
                    headers={"Authorization": f"Bearer {token}"},
                )
                assert admin_only.status_code == 403

                wrong_password = await client.post(
                    "/api/auth/login",
                    json={"email": email, "password": password + "x"},
                )
                assert wrong_password.status_code == 401

                unknown_email = await client.post(
                    "/api/auth/login",
                    json={
                        "email": f"unknown-{uuid.uuid4().hex}@example.com",
                        "password": password,
                    },
                )
                assert unknown_email.status_code == 401

                invalid_token = await client.get(
                    "/api/users/profile",
                    headers={"Authorization": "Bearer malformed-token"},
                )
                assert invalid_token.status_code == 401

                duplicate = await client.post(
                    "/api/auth/register",
                    json={
                        "email": email,
                        "password": password,
                        "full_name": "Auth Integration Test",
                        "role": "Security Analyst",
                    },
                )
                assert duplicate.status_code == 400
        finally:
            await mongo_client.drop_database(database_name)
            mongo_client.close()
