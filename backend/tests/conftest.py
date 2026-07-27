import os
import pytest
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# Load .env.test if it exists, otherwise fall back to .env
if os.path.exists(".env.test"):
    load_dotenv(".env.test")
else:
    load_dotenv(".env")

# Test-only defaults. Production startup rejects missing or placeholder secrets.
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017")
os.environ.setdefault(
    "SECRET_KEY",
    "test-only-secret-key-00000000000000000000000000000000",
)
os.environ.setdefault(
    "INGEST_API_KEY",
    "test-only-ingest-key-000000000000000000000000000000",
)

@pytest.fixture(scope="module")
async def mongodb_client():
    """Async MongoDB client fixture for integration tests."""
    mongodb_url = os.getenv("MONGODB_URL")
    if not mongodb_url:
        raise ValueError("MONGODB_URL is not set in .env.test or .env")
    
    client = AsyncIOMotorClient(mongodb_url)
    db = client["siemless_db_test"]
    
    # Verify connection
    try:
        await client.admin.command("ping")
        print("\n✓ Connected to MongoDB for testing")
    except Exception as e:
        raise RuntimeError(f"Failed to connect to MongoDB: {e}")
    
    yield db
    
    # Cleanup: Drop test database
    await client.drop_database("siemless_db_test")
    client.close()


@pytest.fixture
async def users_collection(mongodb_client):
    """Provide direct access to users collection for testing."""
    await mongodb_client.users.delete_many({})
    return mongodb_client.users


@pytest.fixture
def mock_user_data():
    """Provide mock user data for testing."""
    return {
        "email": "test@example.com",
        "password": "TestPass123!",
        "full_name": "Test User",
        "role": "Security Analyst"
    }
