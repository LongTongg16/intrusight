"""Create the first local administrator without exposing a password in shell history."""

import asyncio
from datetime import datetime, timezone
from getpass import getpass

from email_validator import EmailNotValidError, validate_email

from core.security import hash_password
from database import db
from models.user import RoleEnum
from services.user_service import validate_full_name, validate_password_strength


async def create_admin() -> None:
    email_input = input("Administrator email: ").strip().lower()
    full_name = input("Administrator full name: ").strip()
    password = getpass("Password: ")
    confirmation = getpass("Confirm password: ")

    if password != confirmation:
        raise SystemExit("Passwords do not match")

    try:
        email = validate_email(email_input, check_deliverability=False).normalized
        validate_full_name(full_name)
        validate_password_strength(password)
    except (EmailNotValidError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc

    if await db.users.find_one({"email": email}):
        raise SystemExit("An account with that email already exists")

    result = await db.users.insert_one(
        {
            "email": email,
            "full_name": full_name,
            "hashed_password": hash_password(password),
            "role": RoleEnum.ADMIN.value,
            "status": "active",
            "force_password_change": False,
            "token_version": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    print(f"Created administrator {result.inserted_id}")


if __name__ == "__main__":
    asyncio.run(create_admin())
