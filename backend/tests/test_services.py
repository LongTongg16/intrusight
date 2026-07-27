"""Comprehensive tests for service layer functionality."""
import pytest
import sys
import os
from unittest.mock import patch, AsyncMock, MagicMock
from datetime import datetime
from bson import ObjectId

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.user_service import (
    validate_password_strength,
    validate_full_name,
    create_user,
    get_user_by_email,
    get_user_by_id,
    get_all_users,
    get_users_with_telegram_id,
    update_user_profile,
    change_password
)
from services.auth_service import authenticate_user
from services.geolocation_service import get_location_from_ip
from core.security import hash_password, verify_password


class TestPasswordValidation:
    """Comprehensive tests for password validation."""

    def test_password_valid_complex(self):
        """Test valid complex password."""
        validate_password_strength("ValidPass123!")
        validate_password_strength("MyP@ssw0rd!")
        validate_password_strength("Complex#Pass99")

    def test_password_minimum_length(self):
        """Test password minimum length requirement."""
        with pytest.raises(ValueError, match="at least 8 characters"):
            validate_password_strength("Short1!")

    def test_password_require_lowercase(self):
        """Test password must contain lowercase."""
        with pytest.raises(ValueError, match="lowercase"):
            validate_password_strength("VALIDPASS123!")

    def test_password_require_uppercase(self):
        """Test password must contain uppercase."""
        with pytest.raises(ValueError, match="uppercase"):
            validate_password_strength("validpass123!")

    def test_password_require_digit(self):
        """Test password must contain digit."""
        with pytest.raises(ValueError, match="digit"):
            validate_password_strength("ValidPass!")

    def test_password_require_special_char(self):
        """Test password must contain special character."""
        with pytest.raises(ValueError, match="special character"):
            validate_password_strength("ValidPass123")

    def test_password_special_characters_variety(self):
        """Test various special characters are accepted."""
        special_chars = "!@#$%^&*()_-+=[]{};:'\",.<>?/\\|`~"
        for char in special_chars:
            password = f"Pass123{char}"
            validate_password_strength(password)


class TestFullNameValidation:
    """Comprehensive tests for full name validation."""

    def test_full_name_valid_formats(self):
        """Test valid full name formats."""
        validate_full_name("John Doe")
        validate_full_name("Mary-Jane Watson")
        validate_full_name("O'Brien")
        validate_full_name("Jean-Claude Van Damme")
        validate_full_name("Maria de la Cruz")

    def test_full_name_minimum_length(self):
        """Test full name minimum length."""
        with pytest.raises(ValueError, match="at least 2 characters"):
            validate_full_name("A")

    def test_full_name_maximum_length(self):
        """Test full name maximum length."""
        with pytest.raises(ValueError, match="exceed 100 characters"):
            validate_full_name("A" * 101)

    def test_full_name_invalid_characters(self):
        """Test full name with invalid characters."""
        invalid_names = [
            "John123",
            "User@Name",
            "Test#User",
            "Name!",
            "First_Last"
        ]
        for name in invalid_names:
            with pytest.raises(ValueError):
                validate_full_name(name)

    def test_full_name_edge_cases(self):
        """Test full name edge cases."""
        validate_full_name("Jo")  # Minimum valid
        validate_full_name("A" * 100)  # Maximum valid
        validate_full_name("X-Y")  # Hyphen edge case


class TestCreateUser:
    """Tests for user creation service."""

    @pytest.mark.asyncio
    async def test_create_user_success(self):
        """Test successful user creation."""
        with patch('services.user_service.db') as mock_db:
            mock_db.users.find_one = AsyncMock(return_value=None)
            mock_db.users.insert_one = AsyncMock()
            mock_db.users.insert_one.return_value.inserted_id = "user_123"

            result = await create_user(
                "test@example.com",
                "ValidPass123!",
                "Test User",
                "Security Analyst"
            )

            assert result is not None
            assert result["email"] == "test@example.com"
            assert result["full_name"] == "Test User"
            assert result["id"] == "user_123"
            assert result["status"] == "pending"

    @pytest.mark.asyncio
    async def test_create_user_duplicate_email(self):
        """Test creation fails with duplicate email."""
        with patch('services.user_service.db') as mock_db:
            mock_db.users.find_one = AsyncMock(
                return_value={"_id": "existing", "email": "test@example.com"}
            )

            with pytest.raises(ValueError, match="Email already exists"):
                await create_user(
                    "test@example.com",
                    "ValidPass123!",
                    "Test User",
                    "Security Analyst"
                )

    @pytest.mark.asyncio
    async def test_create_user_weak_password(self):
        """Test creation fails with weak password."""
        with patch('services.user_service.db') as mock_db:
            mock_db.users.find_one = AsyncMock(return_value=None)

            with pytest.raises(ValueError, match="[Pp]assword"):
                await create_user(
                    "test@example.com",
                    "weak",
                    "Test User",
                    "Security Analyst"
                )

    @pytest.mark.asyncio
    async def test_create_user_invalid_full_name(self):
        """Test creation fails with invalid full name."""
        with patch('services.user_service.db') as mock_db:
            mock_db.users.find_one = AsyncMock(return_value=None)

            with pytest.raises(ValueError, match="Full name"):
                await create_user(
                    "test@example.com",
                    "ValidPass123!",
                    "A",
                    "Security Analyst"
                )


class TestGetUser:
    """Tests for user retrieval services."""

    @pytest.mark.asyncio
    async def test_get_user_by_email_found(self):
        """Test getting user by email when found."""
        user_data = {
            "_id": "user_123",
            "email": "test@example.com",
            "full_name": "Test User"
        }

        with patch('services.user_service.db') as mock_db:
            mock_db.users.find_one = AsyncMock(return_value=user_data)

            result = await get_user_by_email("test@example.com")

            assert result is not None
            assert result["email"] == "test@example.com"
            assert result["full_name"] == "Test User"

    @pytest.mark.asyncio
    async def test_get_user_by_email_not_found(self):
        """Test getting user by email when not found."""
        with patch('services.user_service.db') as mock_db:
            mock_db.users.find_one = AsyncMock(return_value=None)

            result = await get_user_by_email("nonexistent@example.com")

            assert result is None

    @pytest.mark.asyncio
    async def test_get_user_by_id_found(self):
        """Test getting user by ID when found."""
        user_data = {
            "_id": ObjectId(),
            "email": "test@example.com",
            "full_name": "Test User"
        }

        with patch('services.user_service.db') as mock_db:
            mock_db.users.find_one = AsyncMock(return_value=user_data)

            user_id = str(user_data["_id"])
            result = await get_user_by_id(user_id)

            assert result is not None
            assert result["email"] == "test@example.com"

    @pytest.mark.asyncio
    async def test_get_user_by_id_invalid_format(self):
        """Test getting user with invalid ID format."""
        with patch('services.user_service.db') as mock_db:
            result = await get_user_by_id("invalid_id")
            assert result is None


class TestGetAllUsers:
    """Tests for getting all users."""

    @pytest.mark.asyncio
    async def test_get_all_users_success(self):
        """Test successfully getting all users."""
        users = [
            {"_id": "user_1", "email": "user1@example.com", "full_name": "User One", "role": "Security Analyst", "status": "active"},
            {"_id": "user_2", "email": "user2@example.com", "full_name": "User Two", "role": "Administrator", "status": "active"}
        ]

        with patch('services.user_service.db') as mock_db:
            async def mock_async_iter(query):
                for user in users:
                    yield user

            mock_db.users.find.return_value = mock_async_iter({})

            result = await get_all_users()

            assert len(result) == 2
            assert result[0]["email"] == "user1@example.com"
            assert result[1]["email"] == "user2@example.com"

    @pytest.mark.asyncio
    async def test_get_all_users_empty(self):
        """Test getting all users when none exist."""
        with patch('services.user_service.db') as mock_db:
            async def mock_async_iter(query):
                return
                yield

            mock_db.users.find.return_value = mock_async_iter({})

            result = await get_all_users()

            assert result == []


class TestGetUsersWithTelegram:
    """Tests for getting users with telegram ID."""

    @pytest.mark.asyncio
    async def test_get_users_with_telegram_success(self):
        """Test getting users with telegram ID."""
        users = [
            {"_id": ObjectId(), "email": "user1@example.com", "full_name": "User One", "telegram_id": "123456"},
            {"_id": ObjectId(), "email": "user2@example.com", "full_name": "User Two", "telegram_id": "789012"}
        ]

        with patch('services.user_service.db') as mock_db:
            async def mock_async_iter(query):
                for user in users:
                    yield user

            mock_db.users.find.return_value = mock_async_iter({"telegram_id": {"$exists": True}})

            result = await get_users_with_telegram_id()

            assert len(result) == 2
            assert result[0]["telegram_id"] == "123456"
            mock_db.users.find.assert_called_once_with(
                {
                    "status": "active",
                    "telegram_id": {"$exists": True, "$nin": [None, ""]},
                }
            )


class TestUpdateUserProfile:
    """Tests for updating user profile."""

    @pytest.mark.asyncio
    async def test_update_full_name_success(self):
        """Test successfully updating full name."""
        user_id = ObjectId()
        updated_user = {
            "_id": user_id,
            "email": "test@example.com",
            "full_name": "Updated Name"
        }

        with patch('services.user_service.db') as mock_db:
            mock_db.users.find_one_and_update = AsyncMock(
                return_value=updated_user
            )

            result = await update_user_profile(str(user_id), "Updated Name", "")

            assert result is not None
            assert result["full_name"] == "Updated Name"

    @pytest.mark.asyncio
    async def test_update_telegram_id(self):
        """Test updating telegram ID only."""
        user_id = ObjectId()
        updated_user = {
            "_id": user_id,
            "email": "test@example.com",
            "telegram_id": "987654"
        }

        with patch('services.user_service.db') as mock_db:
            mock_db.users.find_one = AsyncMock(return_value={"_id": user_id, "full_name": "Test", "email": "test@example.com"})
            mock_db.users.find_one_and_update = AsyncMock(
                return_value=updated_user
            )

            # Pass valid full_name along with telegram_id to avoid validation error
            result = await update_user_profile(str(user_id), "Test", "987654")

            assert result is not None
            assert result["telegram_id"] == "987654"

    @pytest.mark.asyncio
    async def test_update_both_fields(self):
        """Test updating both full name and telegram ID."""
        user_id = ObjectId()
        updated_user = {
            "_id": user_id,
            "full_name": "New Name",
            "telegram_id": "123456"
        }

        with patch('services.user_service.db') as mock_db:
            mock_db.users.find_one_and_update = AsyncMock(
                return_value=updated_user
            )

            result = await update_user_profile(str(user_id), "New Name", "123456")

            assert result is not None
            assert result["full_name"] == "New Name"
            assert result["telegram_id"] == "123456"


class TestChangePassword:
    """Tests for changing password."""

    @pytest.mark.asyncio
    async def test_change_password_success(self):
        """Test successfully changing password."""
        from core.security import hash_password, verify_password
        old_password = "OldPass123!"
        new_password = "NewPass456!"
        hashed_old = hash_password(old_password)

        user_id = ObjectId()
        user_doc = {
            "_id": user_id,
            "email": "test@example.com",
            "hashed_password": hashed_old
        }

        with patch('services.user_service.db') as mock_db:
            mock_db.users.find_one = AsyncMock(return_value=user_doc)
            mock_db.users.find_one_and_update = AsyncMock(return_value=user_doc)

            result = await change_password(str(user_id), old_password, new_password)

            assert result is not None

    @pytest.mark.asyncio
    async def test_change_password_wrong_current(self):
        """Test changing password with wrong current password."""
        from core.security import hash_password
        hashed_old = hash_password("ActualPass123!")

        user_id = ObjectId()
        user_doc = {
            "_id": user_id,
            "email": "test@example.com",
            "hashed_password": hashed_old
        }

        with patch('services.user_service.db') as mock_db:
            mock_db.users.find_one = AsyncMock(return_value=user_doc)

            with pytest.raises(ValueError, match="Current password is incorrect"):
                await change_password(str(user_id), "WrongPass123!", "NewPass456!")


class TestAuthenticateUser:
    """Tests for user authentication."""

    @pytest.mark.asyncio
    async def test_authenticate_success(self):
        """Test successful authentication."""
        password = "ValidPass123!"
        hashed_pwd = hash_password(password)
        user_data = {
            "_id": "user_123",
            "email": "test@example.com",
            "hashed_password": hashed_pwd
        }

        with patch('services.auth_service.get_user_by_email') as mock_get_user:
            mock_get_user.return_value = user_data

            result = await authenticate_user("test@example.com", password)

            assert result is not None
            assert result["email"] == "test@example.com"

    @pytest.mark.asyncio
    async def test_authenticate_user_not_found(self):
        """Test authentication fails when user not found."""
        with patch('services.auth_service.get_user_by_email') as mock_get_user:
            mock_get_user.return_value = None

            result = await authenticate_user("nonexistent@example.com", "Pass123!")

            assert result is None

    @pytest.mark.asyncio
    async def test_authenticate_wrong_password(self):
        """Test authentication fails with wrong password."""
        hashed_pwd = hash_password("CorrectPass123!")
        user_data = {
            "_id": "user_123",
            "email": "test@example.com",
            "hashed_password": hashed_pwd
        }

        with patch('services.auth_service.get_user_by_email') as mock_get_user:
            mock_get_user.return_value = user_data

            result = await authenticate_user("test@example.com", "WrongPass123!")

            assert result is None


class TestGeolocationService:
    """Tests for geolocation service."""

    def test_get_location_from_ip_success(self):
        """Test getting location from valid IP."""
        with patch('services.geolocation_service.get_geoip_reader') as mock_reader_fn:
            mock_response = MagicMock()
            mock_response.country.iso_code = "US"
            mock_response.country.name = "United States"
            mock_response.subdivisions = []
            mock_response.city.name = "New York"
            mock_response.location.latitude = 40.7128
            mock_response.location.longitude = -74.0060

            reader = MagicMock()
            reader.city.return_value = mock_response
            mock_reader_fn.return_value = reader

            result = get_location_from_ip("8.8.8.8")

            assert result is not None
            assert result["country"] == "US"
            assert result["city"] == "New York"

    def test_get_location_no_reader(self):
        """Test location lookup when reader not available."""
        with patch('services.geolocation_service.get_geoip_reader') as mock_reader_fn:
            mock_reader_fn.return_value = None

            result = get_location_from_ip("8.8.8.8")

            assert result is None

    def test_get_location_invalid_ip(self):
        """Test location lookup with invalid IP."""
        with patch('services.geolocation_service.get_geoip_reader') as mock_reader_fn:
            reader = MagicMock()
            reader.city.side_effect = Exception("Invalid IP")
            mock_reader_fn.return_value = reader

            result = get_location_from_ip("invalid_ip")

            assert result is None
