"""
Backend environment loading — the single canonical path.

Everything that needs backend configuration goes through here: the API
(`main.py`, `core/security.py`, `database.py`, `services/alert_service.py`), the
four engine ingestors, and the demonstration loader. Using one helper is what
guarantees the API and the tools that talk to it resolve the *same*
`INGEST_API_KEY`.

Precedence is deliberate and must not change:

  1. a variable already present in the process environment (an explicit
     `export`, a container env, a CI secret) always wins
  2. otherwise the value in ``backend/.env``
  3. otherwise unset, and the caller fails with a clear message

`load_dotenv(..., override=False)` is what implements 1 over 2.
"""

import os
from pathlib import Path

# Imported as a module, not `from dotenv import load_dotenv`, so the lookup
# happens at call time. Tests that isolate themselves from a developer's private
# backend/.env do so by patching `dotenv.load_dotenv`; a name bound at import
# time here would silently bypass that patch.
import dotenv


BACKEND_ENV_FILE = Path(__file__).resolve().with_name(".env")


def load_backend_env() -> None:
    """
    Load ``backend/.env`` without overriding deployment-provided variables.

    The path is derived from this module's own location, so it resolves
    identically whether the caller was started from the repository root,
    from ``backend/``, or from anywhere else. A bare ``load_dotenv()`` searches
    upward from the current working directory instead, which silently finds
    nothing when a script is launched as ``python3 backend/eve_ingestor.py``
    from the repository root.
    """
    dotenv.load_dotenv(BACKEND_ENV_FILE, override=False)


# Mirrors the server-side rule in `core.security.verify_ingest_api_key`. It is
# duplicated rather than imported so that importing this module never pulls in
# the security module (and its import-time SECRET_KEY validation) into a tool
# that only needs a key. The two must stay in step; the shared expectation is
# "at least 24 characters and not a known placeholder".
INGEST_KEY_MIN_LENGTH = 24
INGEST_KEY_PLACEHOLDERS = {
    "change-me",
    "your-ingest-api-key",
    "<generate-a-separate-ingestion-key>",
}


class IngestKeyError(RuntimeError):
    """Raised when no usable ingestion key is configured."""


def resolve_ingest_api_key() -> str:
    """
    Return the ingestion key a client should present, or raise with guidance.

    Applies the same acceptance rule as the server so a misconfigured client
    fails immediately with an actionable message instead of sending a batch of
    requests that will each be rejected. No key material is ever included in
    the raised message.
    """
    load_backend_env()
    key = os.getenv("INGEST_API_KEY", "")

    if not key:
        raise IngestKeyError(
            "INGEST_API_KEY is not set.\n"
            f"  Add it to {BACKEND_ENV_FILE} (or export it) and try again.\n"
            "  Generate one with:  openssl rand -hex 32"
        )

    if len(key) < INGEST_KEY_MIN_LENGTH or key.lower() in INGEST_KEY_PLACEHOLDERS:
        raise IngestKeyError(
            "INGEST_API_KEY is a placeholder or too short; the API will reject it.\n"
            f"  It must be at least {INGEST_KEY_MIN_LENGTH} characters and not an example value.\n"
            "  Generate one with:  openssl rand -hex 32"
        )

    return key
