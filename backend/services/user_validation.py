"""Pure validation helpers shared by user services and operator tooling."""

import re


def validate_password_strength(password: str) -> None:
    """Validate the password policy without logging or transforming the value."""
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password must not exceed 72 UTF-8 bytes")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[0-9]", password):
        raise ValueError("Password must contain at least one digit")
    if not re.search(r"[!@#$%^&*()_\-+=\[\]{};:'\",.<>?/\\|`~]", password):
        raise ValueError("Password must contain at least one special character")


def validate_full_name(full_name: str) -> None:
    """Validate the full-name policy used by API and bootstrap workflows."""
    if len(full_name) < 2:
        raise ValueError("Full name must be at least 2 characters long")
    if len(full_name) > 100:
        raise ValueError("Full name must not exceed 100 characters")
    if not re.match(r"^[a-zA-Z\s\-']+$", full_name):
        raise ValueError(
            "Full name can only contain letters, spaces, hyphens, and apostrophes"
        )
