"""Backend environment loading shared by the API's configuration modules."""

from pathlib import Path

from dotenv import load_dotenv


BACKEND_ENV_FILE = Path(__file__).resolve().with_name(".env")


def load_backend_env() -> None:
    """Load backend/.env without overriding deployment-provided variables."""
    load_dotenv(BACKEND_ENV_FILE, override=False)
