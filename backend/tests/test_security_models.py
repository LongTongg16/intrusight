"""Comprehensive tests for security utilities and models."""
import pytest
import sys
import os
from datetime import datetime, timedelta
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from core.security import (
    hash_password,
    verify_password,
    create_access_token,
    verify_token
)
from models.user import (
    UserIn,
    UserOut,
    LoginIn,
    LoginOut,
    EditProfileIn,
    ChangePasswordIn,
    UserListOut,
    RoleEnum
)
from pydantic import ValidationError


class TestPasswordHashing:
    """Tests for password hashing functionality."""

    def test_hash_password_returns_hash(self):
        """Test hashing password returns hash."""
        password = "TestPass123!"
        hashed = hash_password(password)

        assert hashed is not None
        assert hashed != password
        assert isinstance(hashed, str)
        assert len(hashed) > len(password)

    def test_hash_password_different_each_time(self):
        """Test hashing same password produces different hashes."""
        password = "TestPass123!"
        hash1 = hash_password(password)
        hash2 = hash_password(password)

        assert hash1 != hash2

    def test_verify_password_correct(self):
        """Test verifying correct password."""
        password = "TestPass123!"
        hashed = hash_password(password)

        assert verify_password(password, hashed) is True

    def test_verify_password_incorrect(self):
        """Test verifying incorrect password."""
        password = "TestPass123!"
        wrong_password = "WrongPass123!"
        hashed = hash_password(password)

        assert verify_password(wrong_password, hashed) is False

    def test_verify_password_empty_string(self):
        """Test verifying empty password."""
        hashed = hash_password("TestPass123!")

        assert verify_password("", hashed) is False

    def test_hash_password_special_characters(self):
        """Test hashing password with special characters."""
        passwords = [
            "P@ss!w0rd",
            "Test#123$",
            "Valid&Pass%",
            "Complex(Pass)"
        ]

        for password in passwords:
            hashed = hash_password(password)
            assert verify_password(password, hashed) is True


class TestJWTTokens:
    """Tests for JWT token creation and verification."""

    def test_create_access_token(self):
        """Test creating access token."""
        data = {
            "sub": "user@example.com",
            "user_id": "user_123",
            "role": "Security Analyst"
        }

        token = create_access_token(data)

        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 0

    def test_verify_token_valid(self):
        """Test verifying valid token."""
        data = {
            "sub": "user@example.com",
            "user_id": "user_123",
            "role": "Security Analyst"
        }

        token = create_access_token(data)
        payload = verify_token(token)

        assert payload is not None
        assert payload["sub"] == "user@example.com"
        assert payload["user_id"] == "user_123"
        assert payload["role"] == "Security Analyst"

    def test_verify_token_invalid(self):
        """Test verifying invalid token."""
        invalid_token = "invalid.token.here"

        payload = verify_token(invalid_token)

        assert payload is None

    def test_verify_token_corrupted(self):
        """Test verifying corrupted token."""
        data = {"sub": "user@example.com"}
        token = create_access_token(data)
        corrupted_token = token[:-10] + "corrupted"

        payload = verify_token(corrupted_token)

        assert payload is None

    def test_token_includes_exp(self):
        """Test token includes expiration."""
        data = {"sub": "user@example.com"}
        token = create_access_token(data)
        payload = verify_token(token)

        assert payload is not None
        assert "exp" in payload
        assert payload["exp"] > datetime.utcnow().timestamp()

    def test_token_expiration(self):
        """Test token expiration behavior."""
        data = {"sub": "user@example.com"}
        token = create_access_token(data)
        payload = verify_token(token)

        assert payload is not None
        # Token should be valid immediately after creation
        exp_time = datetime.utcfromtimestamp(payload["exp"])
        assert exp_time > datetime.utcnow()

    def test_token_with_complex_data(self):
        """Test token with complex data structure."""
        data = {
            "sub": "user@example.com",
            "user_id": "user_123",
            "role": "Administrator",
            "permissions": ["read", "write", "delete"],
            "timestamp": datetime.utcnow().isoformat()
        }

        token = create_access_token(data)
        payload = verify_token(token)

        assert payload is not None
        assert payload["role"] == "Administrator"
        assert payload["permissions"] == ["read", "write", "delete"]


class TestUserModel:
    """Tests for User Pydantic model."""

    def test_user_in_valid(self):
        """Test valid UserIn model."""
        user_data = {
            "email": "test@example.com",
            "password": "ValidPass123!",
            "full_name": "Test User",
            "role": RoleEnum.ANALYST
        }

        user = UserIn(**user_data)

        assert user.email == "test@example.com"
        assert user.full_name == "Test User"
        assert user.role == RoleEnum.ANALYST

    def test_user_in_email_validation(self):
        """Test UserIn email validation."""
        user_data = {
            "email": "invalid-email",
            "password": "ValidPass123!",
            "full_name": "Test User",
            "role": RoleEnum.ANALYST
        }

        with pytest.raises(ValidationError):
            UserIn(**user_data)

    def test_user_in_preserves_password_whitespace(self):
        """Password whitespace is significant and must not be silently changed."""
        user_data = {
            "email": "  test@example.com  ",
            "password": "  ValidPass123!  ",
            "full_name": "  Test User  ",
            "role": RoleEnum.ANALYST
        }

        user = UserIn(**user_data)

        assert user.email == "test@example.com"
        assert user.password == "  ValidPass123!  "
        assert user.full_name == "Test User"

    def test_user_in_with_telegram(self):
        """Test UserIn with telegram ID."""
        user_data = {
            "email": "test@example.com",
            "password": "ValidPass123!",
            "full_name": "Test User",
            "role": RoleEnum.ANALYST,
            "telegram_id": "123456"
        }

        user = UserIn(**user_data)

        assert user.telegram_id == "123456"

    def test_user_out_valid(self):
        """Test valid UserOut model."""
        user_data = {
            "id": "user_123",
            "email": "test@example.com",
            "full_name": "Test User",
            "role": RoleEnum.ANALYST.value,
            "status": "active",
            "telegram_id": "123456"
        }

        user = UserOut(**user_data)

        assert user.id == "user_123"
        assert user.email == "test@example.com"
        assert user.status == "active"


class TestLoginModel:
    """Tests for Login Pydantic models."""

    def test_login_in_valid(self):
        """Test valid LoginIn model."""
        login_data = {
            "email": "test@example.com",
            "password": "Password123!"
        }

        login = LoginIn(**login_data)

        assert login.email == "test@example.com"
        assert login.password == "Password123!"

    def test_login_in_email_required(self):
        """Test LoginIn email is required."""
        login_data = {
            "password": "Password123!"
        }

        with pytest.raises(ValidationError):
            LoginIn(**login_data)

    def test_login_in_password_required(self):
        """Test LoginIn password is required."""
        login_data = {
            "email": "test@example.com"
        }

        with pytest.raises(ValidationError):
            LoginIn(**login_data)

    def test_login_out_valid(self):
        """Test valid LoginOut model."""
        user_data = {
            "id": "user_123",
            "email": "test@example.com",
            "full_name": "Test User",
            "role": "Security Analyst",
            "status": "active"
        }

        login_data = {
            "token": "token_abc123",
            "user": user_data,
            "force_password_change": False
        }

        login = LoginOut(**login_data)

        assert login.token == "token_abc123"
        assert login.user.email == "test@example.com"
        assert login.force_password_change is False


class TestEditProfileModel:
    """Tests for EditProfileIn model."""

    def test_edit_profile_valid(self):
        """Test valid EditProfileIn model."""
        profile_data = {
            "full_name": "Updated Name",
            "telegram_id": "789012"
        }

        profile = EditProfileIn(**profile_data)

        assert profile.full_name == "Updated Name"
        assert profile.telegram_id == "789012"

    def test_edit_profile_full_name_required(self):
        """Test EditProfileIn full_name is required."""
        profile_data = {
            "telegram_id": "789012"
        }

        with pytest.raises(ValidationError):
            EditProfileIn(**profile_data)

    def test_edit_profile_strips_whitespace(self):
        """Test EditProfileIn strips whitespace."""
        profile_data = {
            "full_name": "  Updated Name  ",
            "telegram_id": "  789012  "
        }

        profile = EditProfileIn(**profile_data)

        assert profile.full_name == "Updated Name"
        # Model does not strip whitespace by default
        assert profile.telegram_id == "  789012  "


class TestChangePasswordModel:
    """Tests for ChangePasswordIn model."""

    def test_change_password_valid(self):
        """Test valid ChangePasswordIn model."""
        password_data = {
            "current_password": "OldPass123!",
            "new_password": "NewPass456!"
        }

        password = ChangePasswordIn(**password_data)

        assert password.current_password == "OldPass123!"
        assert password.new_password == "NewPass456!"

    def test_change_password_current_required(self):
        """Test ChangePasswordIn current_password is required."""
        password_data = {
            "new_password": "NewPass456!"
        }

        with pytest.raises(ValidationError):
            ChangePasswordIn(**password_data)

    def test_change_password_new_required(self):
        """Test ChangePasswordIn new_password is required."""
        password_data = {
            "current_password": "OldPass123!"
        }

        with pytest.raises(ValidationError):
            ChangePasswordIn(**password_data)

    def test_change_password_preserves_whitespace(self):
        """Password-change inputs preserve significant whitespace."""
        password_data = {
            "current_password": "  OldPass123!  ",
            "new_password": "  NewPass456!  "
        }

        password = ChangePasswordIn(**password_data)

        assert password.current_password == "  OldPass123!  "
        assert password.new_password == "  NewPass456!  "


class TestRoleEnum:
    """Tests for RoleEnum."""

    def test_role_enum_values(self):
        """Test RoleEnum has correct values."""
        assert RoleEnum.ANALYST.value == "Security Analyst"
        assert RoleEnum.ADMIN.value == "Administrator"

    def test_user_with_analyst_role(self):
        """Test UserIn with analyst role."""
        user_data = {
            "email": "test@example.com",
            "password": "ValidPass123!",
            "full_name": "Test User",
            "role": RoleEnum.ANALYST
        }

        user = UserIn(**user_data)

        assert user.role == RoleEnum.ANALYST

    def test_public_user_cannot_request_admin_role(self):
        """Public registration cannot request an administrator role."""
        user_data = {
            "email": "admin@example.com",
            "password": "ValidPass123!",
            "full_name": "Admin User",
            "role": RoleEnum.ADMIN
        }

        with pytest.raises(ValidationError):
            UserIn(**user_data)


class TestUserListOut:
    """Tests for UserListOut model."""

    def test_user_list_out_valid(self):
        """Test valid UserListOut model."""
        user_data = {
            "id": "user_123",
            "email": "test@example.com",
            "full_name": "Test User",
            "role": "Security Analyst",
            "status": "active",
            "telegram_id": "123456"
        }

        user = UserListOut(**user_data)

        assert user.id == "user_123"
        assert user.email == "test@example.com"
        assert user.telegram_id == "123456"

    def test_user_list_out_without_telegram(self):
        """Test UserListOut without telegram ID."""
        user_data = {
            "id": "user_123",
            "email": "test@example.com",
            "full_name": "Test User",
            "role": "Security Analyst",
            "status": "active"
        }

        user = UserListOut(**user_data)

        assert user.telegram_id is None
