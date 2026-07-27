import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL")
if not MONGODB_URL:
    raise RuntimeError("MONGODB_URL must be set")

client = AsyncIOMotorClient(
    MONGODB_URL,
    serverSelectionTimeoutMS=2000,
    connectTimeoutMS=2000,
)
db = client[os.getenv("DATABASE_NAME", "siemless_db")]
