"""Real-Mongo regression coverage for the authentication lifecycle."""

import secrets
import uuid
from unittest.mock import patch

import httpx
import pytest
from motor.motor_asyncio import AsyncIOMotorClient

from core.security import hash_password, verify_password
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


@pytest.mark.asyncio
async def test_admin_reset_and_forced_change_replacement_token_lifecycle():
    database_name = f"siemless_force_change_test_{uuid.uuid4().hex}"
    email = f"forced-change-{uuid.uuid4().hex}@example.com"
    admin_email = f"admin-{uuid.uuid4().hex}@example.com"
    admin_password = f"Aa1!{secrets.token_hex(12)}"
    temporary_password = f"Bb2!{secrets.token_hex(12)}"
    first_password = f"Cc3!{secrets.token_hex(12)}"
    reset_password = f"Dd4!{secrets.token_hex(12)}"
    final_password = f"Ee5!{secrets.token_hex(12)}"
    mongo_client = AsyncIOMotorClient(
        MONGODB_URL,
        serverSelectionTimeoutMS=2000,
        connectTimeoutMS=2000,
    )
    test_database = mongo_client[database_name]
    users = test_database["users"]

    await users.insert_one(
        {
            "email": admin_email,
            "hashed_password": hash_password(admin_password),
            "full_name": "Auth Integration Administrator",
            "role": "Administrator",
            "status": "active",
            "force_password_change": False,
            "token_version": 0,
        }
    )

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
                admin_login = await client.post(
                    "/api/auth/login",
                    json={"email": admin_email, "password": admin_password},
                )
                assert admin_login.status_code == 200
                admin_headers = {
                    "Authorization": f"Bearer {admin_login.json()['token']}"
                }

                creation = await client.post(
                    "/api/users/admin-create",
                    headers=admin_headers,
                    json={
                        "email": email,
                        "password": temporary_password,
                        "full_name": "Forced Change Integration User",
                        "role": "Security Analyst",
                    },
                )
                assert creation.status_code == 201
                user_id = creation.json()["id"]

                initial_login = await client.post(
                    "/api/auth/login",
                    json={"email": email, "password": temporary_password},
                )
                assert initial_login.status_code == 200
                assert initial_login.json()["force_password_change"] is True
                initial_token = initial_login.json()["token"]

                blocked_profile = await client.get(
                    "/api/users/profile",
                    headers={"Authorization": f"Bearer {initial_token}"},
                )
                assert blocked_profile.status_code == 403

                first_change = await client.post(
                    "/api/users/force-change-password",
                    headers={"Authorization": f"Bearer {initial_token}"},
                    json={"new_password": first_password},
                )
                assert first_change.status_code == 200
                replacement_token = first_change.json()["token"]

                immediate_profile = await client.get(
                    "/api/users/profile",
                    headers={"Authorization": f"Bearer {replacement_token}"},
                )
                assert immediate_profile.status_code == 200
                assert immediate_profile.json()["email"] == email

                rejected_initial_token = await client.get(
                    "/api/users/profile",
                    headers={"Authorization": f"Bearer {initial_token}"},
                )
                assert rejected_initial_token.status_code == 401

                normal_login = await client.post(
                    "/api/auth/login",
                    json={"email": email, "password": first_password},
                )
                assert normal_login.status_code == 200
                assert normal_login.json()["force_password_change"] is False
                normal_token = normal_login.json()["token"]
                assert (
                    await client.get(
                        "/api/users/profile",
                        headers={"Authorization": f"Bearer {normal_token}"},
                    )
                ).status_code == 200

                reset = await client.post(
                    f"/api/users/{user_id}/reset-password",
                    headers=admin_headers,
                    json={"new_password": reset_password},
                )
                assert reset.status_code == 200
                assert (
                    await client.get(
                        "/api/users/profile",
                        headers={"Authorization": f"Bearer {normal_token}"},
                    )
                ).status_code == 401

                reset_login = await client.post(
                    "/api/auth/login",
                    json={"email": email, "password": reset_password},
                )
                assert reset_login.status_code == 200
                assert reset_login.json()["force_password_change"] is True
                reset_token = reset_login.json()["token"]

                final_change = await client.post(
                    "/api/users/force-change-password",
                    headers={"Authorization": f"Bearer {reset_token}"},
                    json={"new_password": final_password},
                )
                assert final_change.status_code == 200
                final_replacement_token = final_change.json()["token"]
                assert (
                    await client.get(
                        "/api/users/profile",
                        headers={
                            "Authorization": f"Bearer {final_replacement_token}"
                        },
                    )
                ).status_code == 200
                assert (
                    await client.get(
                        "/api/users/profile",
                        headers={"Authorization": f"Bearer {reset_token}"},
                    )
                ).status_code == 401
        finally:
            await mongo_client.drop_database(database_name)
            mongo_client.close()
