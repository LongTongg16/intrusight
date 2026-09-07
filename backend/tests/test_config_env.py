"""
Tests for backend environment resolution.

The bug these guard: the API and the tools that post to it must resolve the
*same* ``INGEST_API_KEY``. Previously the engine ingestors called a bare
``load_dotenv()``, which searches upward from the current working directory and
therefore found nothing when a script was launched as
``python3 backend/eve_ingestor.py`` from the repository root.

Precedence under test, and it must not change:

  1. a variable already in the process environment wins
  2. otherwise ``backend/.env``
  3. otherwise a clear error

No test reads or asserts against the developer's real ``backend/.env``; every
case points the loader at a temporary file. No key material is ever printed or
embedded in an assertion message.
"""

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import config


# A syntactically valid key used only inside these tests. It is not a real
# credential and is not accepted by anything outside this file.
TEST_KEY = "t" * 64
OTHER_TEST_KEY = "o" * 64


@pytest.fixture
def env_file(tmp_path, monkeypatch):
    """
    Point the loader at a temporary .env and give each test a clean environment.

    Returns a writer so a test can decide what the file contains.
    """
    path = tmp_path / ".env"
    path.write_text("")
    monkeypatch.setattr(config, "BACKEND_ENV_FILE", path)
    monkeypatch.delenv("INGEST_API_KEY", raising=False)

    def write(**values):
        path.write_text("".join(f"{k}={v}\n" for k, v in values.items()))
        return path

    return write


# ── Working-directory independence ───────────────────────────────────────────

class TestPathResolution:
    def test_env_file_is_resolved_from_the_module_not_the_cwd(self):
        """
        The path is derived from config.py's own location, so it is the same
        regardless of where the process was started.
        """
        assert config.BACKEND_ENV_FILE.is_absolute()
        assert config.BACKEND_ENV_FILE.parent.name == "backend"
        assert config.BACKEND_ENV_FILE.name == ".env"

    @pytest.mark.parametrize("start_dir", ["/", "/tmp"])
    def test_resolution_is_identical_from_any_directory(
        self, env_file, monkeypatch, start_dir
    ):
        env_file(INGEST_API_KEY=TEST_KEY)
        monkeypatch.chdir(start_dir)
        assert config.resolve_ingest_api_key() == TEST_KEY

    def test_ingestors_resolve_a_key_when_launched_from_the_repository_root(self):
        """
        The regression itself. Each ingestor is executed as a subprocess with the
        repository root as the working directory; a bare load_dotenv() found
        nothing there, so INGEST_API_KEY came back empty and the ingestor exited
        with "INGEST_API_KEY must be set".

        A temporary key is injected via the environment, so this does not depend
        on the developer's backend/.env, and only a boolean is asserted.
        """
        import subprocess

        repo_root = Path(config.BACKEND_ENV_FILE).parent.parent
        env = {**os.environ, "INGEST_API_KEY": TEST_KEY}

        for module in ("eve_ingestor", "snort_ingestor", "zeek_ingestor", "kismet_ingestor"):
            result = subprocess.run(
                [sys.executable, "-c",
                 "import sys; sys.path.insert(0, 'backend');"
                 f"import {module} as m;"
                 "print(bool(m.INGEST_API_KEY))"],
                cwd=repo_root, env=env, capture_output=True, text=True, timeout=60,
            )
            assert result.returncode == 0, f"{module} failed to import: {result.stderr[-300:]}"
            assert result.stdout.strip() == "True", (
                f"{module} resolved no ingestion key when run from the repository root"
            )


# ── Precedence ───────────────────────────────────────────────────────────────

class TestPrecedence:
    def test_exported_environment_variable_wins_over_the_env_file(
        self, env_file, monkeypatch
    ):
        """An explicit export is authoritative; the file must not clobber it."""
        env_file(INGEST_API_KEY=OTHER_TEST_KEY)
        monkeypatch.setenv("INGEST_API_KEY", TEST_KEY)

        assert config.resolve_ingest_api_key() == TEST_KEY

    def test_env_file_supplies_the_value_when_nothing_is_exported(self, env_file):
        env_file(INGEST_API_KEY=TEST_KEY)
        assert config.resolve_ingest_api_key() == TEST_KEY

    def test_loading_does_not_overwrite_any_existing_variable(
        self, env_file, monkeypatch
    ):
        """
        override=False applies to every variable, not just the ingestion key —
        a deployment-provided MONGODB_URL or SECRET_KEY must survive too.
        """
        env_file(INGEST_API_KEY=OTHER_TEST_KEY, DEMO_MARKER="from-file")
        monkeypatch.setenv("DEMO_MARKER", "from-environment")

        config.load_backend_env()

        assert os.environ["DEMO_MARKER"] == "from-environment"

    def test_a_variable_absent_from_the_environment_is_taken_from_the_file(
        self, env_file, monkeypatch
    ):
        env_file(DEMO_MARKER="from-file")
        monkeypatch.delenv("DEMO_MARKER", raising=False)

        config.load_backend_env()

        assert os.environ["DEMO_MARKER"] == "from-file"


# ── Rejection cases ──────────────────────────────────────────────────────────

class TestRejection:
    def test_missing_key_raises_an_actionable_error(self, env_file):
        env_file()  # empty file, nothing exported

        with pytest.raises(config.IngestKeyError) as exc:
            config.resolve_ingest_api_key()

        message = str(exc.value)
        assert "INGEST_API_KEY is not set" in message
        assert "openssl rand -hex 32" in message

    @pytest.mark.parametrize("placeholder", sorted(config.INGEST_KEY_PLACEHOLDERS))
    def test_known_placeholders_are_rejected(self, env_file, placeholder):
        """The example values in .env.example must never be accepted."""
        env_file(INGEST_API_KEY=placeholder)

        with pytest.raises(config.IngestKeyError, match="placeholder or too short"):
            config.resolve_ingest_api_key()

    def test_placeholder_rejection_is_case_insensitive(self, env_file):
        env_file(INGEST_API_KEY="CHANGE-ME")

        with pytest.raises(config.IngestKeyError):
            config.resolve_ingest_api_key()

    def test_short_key_is_rejected(self, env_file):
        env_file(INGEST_API_KEY="a" * (config.INGEST_KEY_MIN_LENGTH - 1))

        with pytest.raises(config.IngestKeyError, match="placeholder or too short"):
            config.resolve_ingest_api_key()

    def test_key_of_exactly_the_minimum_length_is_accepted(self, env_file):
        env_file(INGEST_API_KEY="a" * config.INGEST_KEY_MIN_LENGTH)
        assert config.resolve_ingest_api_key() == "a" * config.INGEST_KEY_MIN_LENGTH

    def test_error_messages_never_contain_key_material(self, env_file):
        """A diagnostic must not leak the value it rejected."""
        secretish = "z" * 64
        env_file(INGEST_API_KEY=secretish[: config.INGEST_KEY_MIN_LENGTH - 1])

        with pytest.raises(config.IngestKeyError) as exc:
            config.resolve_ingest_api_key()

        assert "z" * 10 not in str(exc.value)

    def test_client_rule_matches_the_server_rule(self):
        """
        config.py duplicates the server's acceptance rule so a tool can fail fast
        without importing the security module. If the two ever drift, a client
        could accept a key the API rejects — this pins them together.
        """
        import inspect

        from core import security

        source = inspect.getsource(security.verify_ingest_api_key)
        assert f"len(expected_key) < {config.INGEST_KEY_MIN_LENGTH}" in source
        for placeholder in config.INGEST_KEY_PLACEHOLDERS:
            assert placeholder in source


# ── The demo loader uses the same resolution ─────────────────────────────────

class TestDemoLoaderCredential:
    @pytest.fixture
    def demo(self):
        import importlib.util

        path = Path(config.BACKEND_ENV_FILE).parent / "tools" / "demo.py"
        spec = importlib.util.spec_from_file_location("intrusight_demo_env", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_loader_uses_the_shared_resolver(self, demo):
        """Not a second, private dotenv call that could diverge from the API."""
        assert demo.resolve_ingest_api_key is config.resolve_ingest_api_key
        assert demo.load_backend_env is config.load_backend_env

    def test_loader_sends_the_resolved_key_in_the_ingest_header(self, demo, monkeypatch):
        captured = {}

        class _Response:
            status_code = 201

            @staticmethod
            def json():
                return {
                    "ok": True,
                    "id": "fixture-id",
                    "created": True,
                    "demo_fixture_id": "suricata-001",
                }

        def fake_post(url, json=None, headers=None, timeout=None):
            captured["headers"] = headers
            return _Response()

        monkeypatch.setattr(demo.requests, "post", fake_post)

        target = demo.ApiTarget("local", demo.LOCAL_API_BASE, TEST_KEY, is_local=True)
        demo._post_record(target, demo.demo_records("suricata")[0])

        assert captured["headers"]["X-Ingest-API-Key"] == TEST_KEY

    def test_loader_tags_every_record_with_demo_ownership(self, demo):
        """Cleanup and idempotency rely on both ownership fields."""
        records = demo.demo_records()
        assert len(records) == demo.EXPECTED_RECORDS
        assert len({record.fixture_id for record in records}) == len(records)
        for record in records:
            context = record.payload["engine_context"]
            assert context["provenance"] == demo.PROVENANCE
            assert context["demo_fixture_id"] == record.fixture_id

    def test_load_exits_before_sending_anything_when_no_key_is_configured(
        self, demo, env_file, monkeypatch
    ):
        """
        A misconfiguration must report once, not as one failure per record.
        """
        env_file()  # no key
        sent = []
        monkeypatch.setattr(demo.requests, "post",
                            lambda *a, **k: sent.append(1))

        with pytest.raises(demo.OperatorError) as exc:
            demo.prompt_target("local")

        assert "INGEST_API_KEY is not set" in str(exc.value)
        assert sent == [], "no request should be attempted without a usable key"

    def test_rejected_credentials_stop_after_the_first_failure(
        self, demo, env_file, monkeypatch
    ):
        """
        The reported symptom was 21 identical 401 lines. One rejection is enough
        to know the credential is wrong.
        """
        attempts = []

        class _Unauthorized:
            status_code = 401

        def fake_get(url, json=None, headers=None, timeout=None):
            attempts.append(1)
            return _Unauthorized()

        target = demo.ApiTarget("local", demo.LOCAL_API_BASE, TEST_KEY, is_local=True)
        monkeypatch.setattr(demo.requests, "get", fake_get)
        with pytest.raises(demo.OperatorError, match="rejected INGEST_API_KEY"):
            demo.cmd_load(target, "suricata")

        assert len(attempts) == 1, "should stop on the first credential rejection"
