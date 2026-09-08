import os
from datetime import datetime, timedelta, timezone
from secrets import compare_digest

from bson import ObjectId
from jose import JWTError, jwt
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from config import load_backend_env
from core.password_security import hash_password, verify_password

load_backend_env()

security = HTTPBearer()


def _load_secret_key() -> str:
    secret = os.getenv("SECRET_KEY", "")
    known_placeholders = {
        "your-secret-key",
        "change-me",
        "<generate-with-openssl-rand-hex-32>",
    }
    if len(secret) < 32 or secret.lower() in known_placeholders:
        raise RuntimeError(
            "SECRET_KEY must be set to a non-placeholder value of at least 32 characters"
        )
    return secret


SECRET_KEY = _load_secret_key()
ALGORITHM = os.getenv("ALGORITHM", "HS256")
if ALGORITHM not in {"HS256", "HS384", "HS512"}:
    raise RuntimeError("ALGORITHM must be HS256, HS384, or HS512")

ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
if ACCESS_TOKEN_EXPIRE_MINUTES < 1:
    raise RuntimeError("ACCESS_TOKEN_EXPIRE_MINUTES must be at least 1")


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"iat": now, "exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            options={"require_exp": True, "require_iat": True},
        )
        return payload
    except JWTError:
        return None


async def _authenticate_credentials(
    credentials: HTTPAuthorizationCredentials,
) -> tuple[dict, dict]:
    token = credentials.credentials
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = payload.get("user_id")
    if not user_id or not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    from database import db

    try:
        user = await db["users"].find_one(
            {"_id": ObjectId(user_id)},
            {
                "status": 1,
                "role": 1,
                "force_password_change": 1,
                "token_version": 1,
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Authentication service unavailable") from exc

    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if user.get("status", "active") != "active":
        raise HTTPException(status_code=403, detail="Account is not active")
    if user.get("role") not in {"Administrator", "Security Analyst"}:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # token_version is the single session-generation boundary. Every logout,
    # password reset/change, and account-status change increments the stored
    # generation, so tokens from earlier generations fail deterministically.
    # token_invalidated_at is retained only as second-precision audit metadata;
    # comparing it with JWT iat would reintroduce timestamp precision races.
    if payload.get("ver", 0) != user.get("token_version", 0):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return {**payload, "role": user["role"]}, user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> dict:
    payload, user = await _authenticate_credentials(credentials)
    if user.get("force_password_change"):
        raise HTTPException(status_code=403, detail="Password change required")
    return payload


async def get_current_user_for_password_change(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> dict:
    payload, _ = await _authenticate_credentials(credentials)
    return payload


def verify_ingest_api_key(provided_key: str | None) -> None:
    expected_key = os.getenv("INGEST_API_KEY", "")
    known_placeholders = {
        "change-me",
        "your-ingest-api-key",
        "<generate-a-separate-ingestion-key>",
    }
    if len(expected_key) < 24 or expected_key.lower() in known_placeholders:
        raise HTTPException(status_code=503, detail="Alert ingestion is not configured")
    if not provided_key or not compare_digest(provided_key, expected_key):
        raise HTTPException(status_code=401, detail="Invalid ingestion credentials")
