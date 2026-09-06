import os

from pymongo import MongoClient

from config import load_backend_env

load_backend_env()

# MONGODB_URL is the single canonical connection variable for the whole backend.
# This synchronous alert client and the async Motor client in database.py must
# never address different deployments, so there is deliberately no per-service
# override here. Unlike database.py this module tolerates an unset value so that
# get_collection() can return None and callers answer 503 rather than failing at
# import time.
MONGODB_URL = os.getenv("MONGODB_URL")
DB_NAME = os.getenv("DATABASE_NAME", "siemless_db")
COLLECTION_NAME = "alerts"

SEVERITY_LABELS = {1: "high", 2: "medium", 3: "low"}
ALLOWED_STATUS = {"new", "investigating", "resolved"}

_client = (
    MongoClient(
        MONGODB_URL,
        serverSelectionTimeoutMS=2000,
        connectTimeoutMS=2000,
    )
    if MONGODB_URL
    else None
)


def get_collection():
    if _client is None:
        return None
    return _client[DB_NAME][COLLECTION_NAME]
