"""Operator CLI tests for target safety, cold starts, and concise errors."""

import secrets
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tools import demo


TEST_KEY = f"test-only-{secrets.token_hex(24)}"
SECRET_MARKER = secrets.token_hex(12)
CUSTOM_BASE = "https://backend.example.com"


def _target(*, local=False):
    return demo.ApiTarget(
        "local" if local else "production/custom",
        demo.LOCAL_API_BASE if local else CUSTOM_BASE,
        TEST_KEY,
        is_local=local,
    )


def _input_from(values):
    answers = iter(values)
    return lambda _prompt: next(answers)


class Response:
    def __init__(self, status_code=200, body=None):
        self.status_code = status_code
        self._body = body if body is not None else {}

    def json(self):
        return self._body


def test_local_target_uses_backend_environment(monkeypatch):
    loader = Mock()
    resolver = Mock(return_value=TEST_KEY)
    monkeypatch.setattr(demo, "load_backend_env", loader)
    monkeypatch.setattr(demo, "resolve_ingest_api_key", resolver)
    monkeypatch.setenv("DEMO_API_BASE", demo.LOCAL_API_BASE)

    target = demo.prompt_target(
        input_fn=_input_from(["1"]),
        getpass_fn=Mock(side_effect=AssertionError("secret prompt must not run")),
    )

    loader.assert_called_once_with()
    resolver.assert_called_once_with()
    assert target.api_base == demo.LOCAL_API_BASE
    assert target.is_local is True


def test_local_target_rejects_remote_environment(monkeypatch):
    monkeypatch.setattr(demo, "load_backend_env", Mock())
    monkeypatch.setattr(demo, "resolve_ingest_api_key", Mock(return_value=TEST_KEY))
    monkeypatch.setenv("DEMO_API_BASE", CUSTOM_BASE)

    with pytest.raises(demo.OperatorError, match="non-local API host"):
        demo.prompt_target("local")


def test_custom_target_prompts_for_hidden_key_without_printing_it(
    monkeypatch, capsys
):
    monkeypatch.setattr(demo, "PROCESS_DEMO_API_BASE", None)
    monkeypatch.setattr(demo, "PROCESS_INGEST_API_KEY", None)
    key = f"{TEST_KEY}-{SECRET_MARKER}"
    secret_prompt = Mock(return_value=key)

    target = demo.prompt_target(
        "custom",
        input_fn=_input_from([CUSTOM_BASE]),
        getpass_fn=secret_prompt,
    )
    demo.print_target_summary(target)

    secret_prompt.assert_called_once_with("INGEST_API_KEY: ")
    output = capsys.readouterr().out
    assert CUSTOM_BASE in output
    assert key not in output
    assert SECRET_MARKER not in output
    assert key not in repr(target)


def test_custom_target_accepts_process_environment_override(monkeypatch):
    monkeypatch.setattr(demo, "PROCESS_DEMO_API_BASE", CUSTOM_BASE)
    monkeypatch.setattr(demo, "PROCESS_INGEST_API_KEY", TEST_KEY)
    secret_prompt = Mock(side_effect=AssertionError("secret prompt must not run"))

    target = demo.prompt_target(
        "custom",
        input_fn=_input_from([""]),
        getpass_fn=secret_prompt,
    )

    assert target.api_base == CUSTOM_BASE
    assert target.ingest_api_key == TEST_KEY
    secret_prompt.assert_not_called()


def test_cancelled_load_makes_no_health_or_ingest_request(monkeypatch, capsys):
    target = _target()
    monkeypatch.setattr(demo, "prompt_target", Mock(return_value=target))
    health = Mock(side_effect=AssertionError("health request must not run"))
    post = Mock(side_effect=AssertionError("ingest request must not run"))
    monkeypatch.setattr(demo, "wait_for_backend", health)
    monkeypatch.setattr(demo.requests, "post", post)

    result = demo.main(["load", "--custom"], input_fn=_input_from([""]))

    assert result == 0
    health.assert_not_called()
    post.assert_not_called()
    assert "no changes were made" in capsys.readouterr().out


def test_healthy_backend_returns_immediately():
    get_fn = Mock(
        return_value=Response(
            200,
            {"ok": True, "ready": True, "checks": {"mongodb": "reachable"}},
        )
    )
    sleep_fn = Mock()

    demo.wait_for_backend(_target(), get_fn=get_fn, sleep_fn=sleep_fn)

    get_fn.assert_called_once()
    sleep_fn.assert_not_called()


def test_cold_start_retries_until_backend_is_ready(capsys):
    responses = iter(
        [
            Response(503),
            Response(200, {"ok": True, "ready": False}),
            Response(200, {"ok": True, "ready": True}),
        ]
    )
    now = [0.0]

    def sleep_fn(seconds):
        now[0] += seconds

    demo.wait_for_backend(
        _target(),
        get_fn=lambda *_args, **_kwargs: next(responses),
        sleep_fn=sleep_fn,
        clock=lambda: now[0],
        max_wait=20,
    )

    assert "Backend is waking up..." in capsys.readouterr().out
    assert now[0] > 0


def test_health_failure_is_concise_for_local_backend():
    with pytest.raises(demo.OperatorError, match="Local backend is not ready"):
        demo.wait_for_backend(
            _target(local=True),
            get_fn=Mock(side_effect=requests.ConnectionError("sensitive details")),
            max_wait=0,
        )


def test_health_tls_failure_is_actionable():
    with pytest.raises(demo.OperatorError, match="TLS verification failed"):
        demo.wait_for_backend(
            _target(),
            get_fn=Mock(side_effect=requests.exceptions.SSLError("certificate")),
        )


def test_read_timeout_retries_same_fixture_id_without_printing_key(
    monkeypatch, capsys
):
    record = demo.demo_records("suricata")[0]
    post = Mock(
        side_effect=[
            requests.exceptions.ReadTimeout("first"),
            Response(
                200,
                {
                    "ok": True,
                    "created": False,
                    "demo_fixture_id": record.fixture_id,
                },
            ),
        ]
    )
    monkeypatch.setattr(demo.requests, "post", post)

    result = demo._post_record(_target(), record)

    assert result["created"] is False
    assert post.call_count == 2
    first_payload = post.call_args_list[0].kwargs["json"]
    second_payload = post.call_args_list[1].kwargs["json"]
    assert first_payload["engine_context"]["demo_fixture_id"] == record.fixture_id
    assert second_payload == first_payload
    assert TEST_KEY not in capsys.readouterr().out


@pytest.mark.parametrize(
    ("status_code", "message"),
    [
        (401, "rejected INGEST_API_KEY"),
        (409, "fixture identity conflicts"),
        (422, "invalid demo payload"),
        (500, "HTTP 500"),
        (503, "MongoDB is unavailable"),
    ],
)
def test_load_http_failures_are_concise(monkeypatch, status_code, message):
    monkeypatch.setattr(
        demo.requests,
        "post",
        Mock(return_value=Response(status_code)),
    )

    with pytest.raises(demo.OperatorError, match=message):
        demo._post_record(_target(), demo.demo_records("suricata")[0])


def test_load_refuses_an_older_backend_before_posting(monkeypatch):
    monkeypatch.setattr(
        demo.requests,
        "get",
        Mock(return_value=Response(404)),
    )
    post = Mock(side_effect=AssertionError("no fixture may be posted"))
    monkeypatch.setattr(demo.requests, "post", post)

    with pytest.raises(demo.OperatorError, match="HTTP 404"):
        demo.cmd_load(_target(), "suricata")

    post.assert_not_called()


def test_load_refuses_legacy_demo_records_before_posting(monkeypatch):
    monkeypatch.setattr(
        demo,
        "_status",
        Mock(
            return_value={
                "engines": {},
                "legacy_records": 21,
                "duplicate_records": 0,
            }
        ),
    )
    post = Mock(side_effect=AssertionError("no fixture may be posted"))
    monkeypatch.setattr(demo.requests, "post", post)

    with pytest.raises(demo.OperatorError, match="Run demo.py clear"):
        demo.cmd_load(_target())

    post.assert_not_called()


def test_clear_requires_confirmation_before_delete(monkeypatch, capsys):
    monkeypatch.setattr(
        demo,
        "_status",
        Mock(return_value={"total": 17, "engines": {}}),
    )
    delete = Mock(side_effect=AssertionError("delete must not run"))
    monkeypatch.setattr(demo.requests, "delete", delete)

    result = demo.cmd_clear(_target(), input_fn=_input_from(["n"]))

    assert result == 0
    delete.assert_not_called()
    output = capsys.readouterr().out
    assert "remove 17 replayed-fixture demo records" in output
    assert CUSTOM_BASE in output
    assert "no changes were made" in output


def test_status_output_has_exact_engine_and_kind_totals(capsys):
    status = {
        "engines": {
            "suricata": {"detections": 4, "observations": 0, "total": 4},
            "snort": {"detections": 4, "observations": 0, "total": 4},
            "zeek": {"detections": 1, "observations": 6, "total": 7},
            "kismet": {"detections": 2, "observations": 4, "total": 6},
        },
        "total": 21,
        "detections": 11,
        "observations": 10,
        "complete": True,
    }

    demo.print_status(status)

    output = capsys.readouterr().out
    assert "Suricata: 4 detections" in output
    assert "Snort:    4 detections" in output
    assert "Zeek:     1 detection, 6 observations" in output
    assert "Kismet:   2 detections, 4 observations" in output
    assert "21 records" in output
    assert "11 detections" in output
    assert "10 observations" in output


def test_invalid_arguments_do_not_echo_a_secret(capsys):
    with pytest.raises(SystemExit):
        demo._parser().parse_args(["load", "--api-key", SECRET_MARKER])

    captured = capsys.readouterr()
    assert SECRET_MARKER not in captured.out
    assert SECRET_MARKER not in captured.err
