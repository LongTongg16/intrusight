import os

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URL")
DB_NAME = os.getenv("DATABASE_NAME", "siemless_db")
COLLECTION_NAME = "alerts"

SEVERITY_LABELS = {1: "high", 2: "medium", 3: "low"}
ALLOWED_STATUS = {"new", "investigating", "resolved"}

_client = (
    MongoClient(
        MONGO_URI,
        serverSelectionTimeoutMS=2000,
        connectTimeoutMS=2000,
    )
    if MONGO_URI
    else None
)


def get_collection():
    if _client is None:
        return None
    return _client[DB_NAME][COLLECTION_NAME]
