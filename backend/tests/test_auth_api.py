"""Comprehensive tests for authentication and user management endpoints."""
import pytest
import sys
import os
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
from datetime import datetime, timedelta
from bson import ObjectId

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from main import app
from core.security import hash_password, verify_token, create_access_token


@pytest.fixture
def client():
    """Provide TestClient for API testing."""
    return TestClient(app)


class TestAuthRegister:
    """Tests for user registration endpoint."""

    def test_register_success(self, client):
        """Test successful user registration."""
        with patch('services.user_service.db') as mock_db:
            mock_db.users.find_one = AsyncMock(return_value=None)
            mock_db.users.insert_one = AsyncMock()
            mock_db.users.insert_one.return_value.inserted_id = "user_123"

            response = client.post(
                "/api/auth/register",
                json={
                    "email": "newuser@example.com",
                    "password": "ValidPass123!",
                    "full_name": "New User",
                    "role": "Security Analyst"
                }
            )

            assert response.status_code == 201
            data = response.json()
            assert data["email"] == "newuser@example.com"
            assert data["full_name"] == "New User"
            assert data["role"] == "Security Analyst"
            assert "id" in data

    def test_register_duplicate_email(self, client):
        """Test registration fails with duplicate email."""
        with patch('services.user_service.db') as mock_db:
            mock_db.users.find_one = AsyncMock(
                return_value={"email": "existing@example.com", "_id": "existing"}
            )

            response = client.post(
                "/api/auth/register",
                json={
                    "email": "existing@example.com",
                    "password": "ValidPass123!",
                    "full_name": "Existing User",
                    "role": "Security Analyst"
                }
            )

            assert response.status_code == 400
            assert "Email already exists" in response.json()["detail"]

    def test_register_weak_password(self, client):
        """Test registration fails with weak password."""
        with patch('services.user_service.db') as mock_db:
            mock_db.users.find_one = AsyncMock(return_value=None)

            response = client.post(
                "/api/auth/register",
                json={
                    "email": "user@example.com",
                    "password": "weak",
                    "full_name": "User Name",
                    "role": "Security Analyst"
                }
            )

            assert response.status_code == 400
            assert "password" in response.json()["detail"].lower()

    def test_register_invalid_email_format(self, client):
        """Test registration fails with invalid email format."""
        response = client.post(
            "/api/auth/register",
            json={
                "email": "invalid-email",
                "password": "ValidPass123!",
                "full_name": "User Name",
                "role": "Security Analyst"
            }
        )

        assert response.status_code == 422

    def test_register_invalid_full_name(self, client):
        """Test registration fails with invalid full name."""
        with patch('services.user_service.db') as mock_db:
            mock_db.users.find_one = AsyncMock(return_value=None)

            response = client.post(
                "/api/auth/register",
                json={
                    "email": "user@example.com",
                    "password": "ValidPass123!",
                    "full_name": "A",
                    "role": "Security Analyst"
                }
            )

            assert response.status_code == 400


class TestAuthLogin:
    """Tests for login endpoint."""

    def test_login_success(self, client):
        """Test successful login."""
        password = "ValidPass123!"
        hashed_pwd = hash_password(password)

        with patch('services.auth_service.get_user_by_email') as mock_get_user:
            mock_get_user.return_value = {
                "_id": "user_123",
                "email": "user@example.com",
                "hashed_password": hashed_pwd,
                "full_name": "Test User",
                "role": "Security Analyst"
            }

            response = client.post(
                "/api/auth/login",
                json={
                    "email": "user@example.com",
                    "password": password
                }
            )

            assert response.status_code == 200
            data = response.json()
            assert "token" in data
            assert data["user"]["email"] == "user@example.com"
            assert data["user"]["full_name"] == "Test User"
            assert data["user"]["role"] == "Security Analyst"

    def test_login_invalid_email(self, client):
        """Test login fails with non-existent email."""
        with patch('services.auth_service.get_user_by_email') as mock_get_user:
            mock_get_user.return_value = None

            response = client.post(
                "/api/auth/login",
                json={
                    "email": "nonexistent@example.com",
                    "password": "ValidPass123!"
                }
            )

            assert response.status_code == 401
            assert "Invalid email or password" in response.json()["detail"]

    def test_login_invalid_password(self, client):
        """Test login fails with incorrect password."""
        hashed_pwd = hash_password("CorrectPass123!")

        with patch('services.auth_service.get_user_by_email') as mock_get_user:
            mock_get_user.return_value = {
                "_id": "user_123",
                "email": "user@example.com",
                "hashed_password": hashed_pwd,
                "full_name": "Test User",
                "role": "Security Analyst"
            }

            response = client.post(
                "/api/auth/login",
                json={
                    "email": "user@example.com",
                    "password": "WrongPass123!"
                }
            )

            assert response.status_code == 401

    def test_login_force_password_change_flag(self, client):
        """Test login includes force_password_change flag."""
        password = "ValidPass123!"
        hashed_pwd = hash_password(password)

        with patch('services.auth_service.get_user_by_email') as mock_get_user:
            mock_get_user.return_value = {
                "_id": "user_123",
                "email": "user@example.com",
                "hashed_password": hashed_pwd,
                "full_name": "Test User",
                "role": "Security Analyst",
                "force_password_change": True
            }

            response = client.post(
                "/api/auth/login",
                json={
                    "email": "user@example.com",
                    "password": password
                }
            )

            assert response.status_code == 200
            data = response.json()
            assert data["force_password_change"] is True

    def test_login_rejects_inactive_account(self, client):
        password = "ValidPass123!"
        with patch('services.auth_service.get_user_by_email') as mock_get_user:
            mock_get_user.return_value = {
                "_id": ObjectId(),
                "email": "pending@example.com",
                "hashed_password": hash_password(password),
                "full_name": "Pending User",
                "role": "Security Analyst",
                "status": "pending",
            }
            response = client.post(
                "/api/auth/login",
                json={"email": "pending@example.com", "password": password},
            )

        assert response.status_code == 403
        assert response.json()["detail"] == "Account is not active"


class TestUserManagement:
    """Tests for admin user management endpoints."""

    def test_get_all_users_non_admin(self, client):
        """Test non-admin cannot get all users."""
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
            response = client.get(
                "/api/users",
                headers={"Authorization": f"Bearer {token}"}
            )

        assert response.status_code == 403


class TestLogout:
    """Tests for logout endpoint."""

    def test_logout_success(self, client):
        """Test successful logout."""
        user_id = str(ObjectId())
        token = create_access_token({"sub": "user@example.com", "user_id": user_id})

        with patch('database.db') as mock_db, patch('routes.auth.db') as route_db:
            mock_db.__getitem__.return_value.find_one = AsyncMock(
                return_value={
                    "status": "active",
                    "role": "Security Analyst",
                    "token_version": 0,
                }
            )
            mock_db.__getitem__.return_value.update_one = AsyncMock()
            route_db.__getitem__.return_value.update_one = AsyncMock()

            response = client.post(
                "/api/auth/logout",
                headers={"Authorization": f"Bearer {token}"}
            )

            assert response.status_code == 200
            assert response.json()["ok"] is True
            assert "Logged out successfully" in response.json()["message"]


class TestPasswordChangeRouteContract:
    """
    Regression guard for the route the Profile pages call.

    Both Profile pages used to PUT to `/api/users/profile/password`, which was
    never registered, so the password-change UI returned 404. They now POST to
    `/api/users/change-password` through the shared API service layer.
    """

    def _routes(self):
        return {
            (getattr(route, "path", ""), method)
            for route in app.routes
            for method in getattr(route, "methods", set())
        }

    def test_change_password_route_is_registered_for_post(self):
        assert ("/api/users/change-password", "POST") in self._routes()

    def test_stale_profile_password_path_is_not_registered(self):
        paths = {path for path, _ in self._routes()}
        assert "/api/users/profile/password" not in paths

    def test_stale_profile_password_path_is_not_handled(self, client):
        for call in (client.put, client.post):
            response = call(
                "/api/users/profile/password",
                json={"current_password": "OldPass123!", "new_password": "NewPass456!"},
            )
            assert response.status_code in (404, 405)

    def test_endpoint_body_contract_matches_the_frontend_payload(self):
        """The keys the shared api.js `changePassword` helper sends."""
        from models.user import ChangePasswordIn

        body = ChangePasswordIn(
            current_password="OldPass123!",
            new_password="NewPass456!",
        )

        assert set(body.model_dump()) == {"current_password", "new_password"}

    def test_change_password_requires_authentication(self, client):
        response = client.post(
            "/api/users/change-password",
            json={"current_password": "OldPass123!", "new_password": "NewPass456!"},
        )
        assert response.status_code in (401, 403)
