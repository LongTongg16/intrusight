import os
from motor.motor_asyncio import AsyncIOMotorClient

from config import load_backend_env

load_backend_env()

MONGODB_URL = os.getenv("MONGODB_URL")
if not MONGODB_URL:
    raise RuntimeError("MONGODB_URL must be set")

client = AsyncIOMotorClient(
    MONGODB_URL,
    serverSelectionTimeoutMS=2000,
    connectTimeoutMS=2000,
)
db = client[os.getenv("DATABASE_NAME", "siemless_db")]


async def database_is_reachable() -> bool:
    """Return whether MongoDB answers a ping without leaking connection details."""
    try:
        await client.admin.command("ping")
    except Exception:
        # Health diagnostics must remain available while MongoDB is starting or
        # temporarily unavailable. Application endpoints still surface their
        # normal database errors; this helper does not hide or replace them.
        return False
    return True
