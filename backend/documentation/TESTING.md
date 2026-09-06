# Testing Framework Setup

> **Historical working note.** This file records the state of the project at an
> earlier milestone. Test counts, coverage figures, file paths, and readiness
> statements in it are not current and are not maintained. For the current
> position see [`README.md`](../../README.md) and
> [`SECURITY_AUDIT.md`](../../SECURITY_AUDIT.md), which are authoritative where
> they conflict with this file.

## ✅ Implementation Complete

The testing framework has been successfully set up with:

- **Framework**: pytest with pytest-asyncio for async test support
- **Coverage**: pytest-cov for code coverage reporting
- **Database**: Local MongoDB integration for testing
- **CI/CD**: GitHub Actions workflow for automated testing

## Directory Structure

```
backend/
├── tests/
│   ├── __init__.py
│   ├── conftest.py          # Pytest configuration and fixtures
│   └── test_auth.py         # Authentication tests (14 test cases)
├── .env.test                # Test database configuration
├── pytest.ini               # Pytest settings
├── docker-compose.test.yml  # MongoDB for local testing
└── requirements.txt         # Updated with test dependencies
```

## Setup Instructions

### 1. Install Dependencies

All testing dependencies are already in `requirements.txt`:
- pytest==8.3.4
- pytest-asyncio==0.25.0
- pytest-cov==6.0.0

```bash
cd backend
pip install -r requirements.txt
```

### 2. Start MongoDB (For Integration Tests)

Option A: Using Docker Compose (Recommended)
```bash
docker-compose -f docker-compose.test.yml up -d
```

Option B: Using Docker directly
```bash
docker run -d -p 27017:27017 --name mongodb-test mongo:latest
```

Option C: Using existing local MongoDB
- Ensure MongoDB is running on `localhost:27017`
- Update `.env.test` if using a different URL

Verify connection:
```bash
docker-compose -f docker-compose.test.yml ps
# or
mongosh localhost:27017
```

## Running Tests

### All Tests
```bash
cd backend
pytest
```

### Specific Test Class
```bash
pytest tests/test_auth.py::TestPasswordValidation
pytest tests/test_auth.py::TestFullNameValidation
pytest tests/test_auth.py::TestCreateUser
```

### Specific Test Function
```bash
pytest tests/test_auth.py::TestPasswordValidation::test_password_too_short
```

### With Verbose Output
```bash
pytest -v
```

### With Coverage Report (HTML)
```bash
pytest --cov
# Open htmlcov/index.html in browser
```

### Coverage Report (Terminal)
```bash
pytest --cov --cov-report=term-missing
```

## Test Coverage

Current coverage:
- **services/user_service.py**: 100%
- **Overall**: 53%

### Test Breakdown (14 Tests Total)

**TestPasswordValidation (6 tests)**
- ✓ test_password_too_short
- ✓ test_password_missing_lowercase
- ✓ test_password_missing_uppercase
- ✓ test_password_missing_digit
- ✓ test_password_missing_special_char
- ✓ test_password_valid

**TestFullNameValidation (4 tests)**
- ✓ test_full_name_too_short
- ✓ test_full_name_too_long
- ✓ test_full_name_invalid_characters
- ✓ test_full_name_valid

**TestCreateUser (4 tests)**
- ✓ test_create_user_success
- ✓ test_create_user_email_already_exists
- ✓ test_create_user_invalid_password
- ✓ test_create_user_whitespace_trimming

## CI/CD Integration

GitHub Actions workflow is configured at `.github/workflows/test.yml`

### Features:
- Automatic MongoDB service setup
- Runs on every push and pull request
- Generates coverage reports
- Uploads to Codecov

### Triggered on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

### Run workflow manually:
```bash
gh workflow run test.yml
```

## Environment Configuration

### .env.test
```
MONGODB_URL=mongodb://localhost:27017
```

Falls back to `.env` if `.env.test` doesn't exist.

## Fixtures Reference

### mongodb_client (Module Scope)
```python
async def test_example(mongodb_client):
    db = mongodb_client  # Access test database
```

### users_collection
```python
async def test_example(users_collection):
    await users_collection.insert_one({...})
```

### mock_user_data
```python
def test_example(mock_user_data):
    user_data = mock_user_data  # Pre-defined test user
```

## Adding New Tests

### Example Test File
```python
import pytest
from services.your_service import your_function

@pytest.mark.asyncio
async def test_async_function(users_collection, mock_user_data):
    # Your test code
    pass
```

### Naming Conventions
- Test files: `test_*.py`
- Test classes: `Test*`
- Test functions: `test_*`

## Troubleshooting

### MongoDB Connection Error
```bash
# Check if MongoDB is running
docker-compose -f docker-compose.test.yml ps

# View logs
docker-compose -f docker-compose.test.yml logs mongodb

# Restart MongoDB
docker-compose -f docker-compose.test.yml restart
```

### Import Errors
```bash
# Ensure working directory is backend/
cd backend
pytest

# Or specify path
pytest tests/
```

### Async Test Issues
Verify `pytest.ini` has proper asyncio settings:
```ini
asyncio_mode = auto
asyncio_default_fixture_loop_scope = function
```

### Event Loop Errors
Clear pytest cache:
```bash
rm -rf .pytest_cache
pytest
```

## Next Steps

1. **Add Integration Tests**: Create tests with real MongoDB operations
2. **Add Route Tests**: Test FastAPI endpoints in `routes/`
3. **Add Model Tests**: Test Pydantic models in `models/`
4. **Increase Coverage**: Target >80% code coverage
5. **Performance Tests**: Add tests for load and performance

## Resources

- [pytest Documentation](https://docs.pytest.org/)
- [pytest-asyncio](https://pytest-asyncio.readthedocs.io/)
- [Motor Documentation](https://motor.readthedocs.io/)
- [MongoDB Testing Best Practices](https://docs.mongodb.com/manual/administration/analysis-plan-development/)
