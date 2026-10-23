import json

import httpx
import pytest

from hive_reader.extract import litellm_reasoning


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


class _FakeClient:
    def __init__(self, response: _FakeResponse) -> None:
        self._response = response

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def post(self, *_args, **_kwargs):
        return self._response


class _RaisingClient:
    def __init__(self, error: Exception) -> None:
        self._error = error

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def post(self, *_args, **_kwargs):
        raise self._error


def _gateway_post_request() -> httpx.Request:
    return httpx.Request("POST", "http://litellm.test/chat/completions")


@pytest.fixture(autouse=True)
def litellm_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LITELLM_BASE_URL", "http://litellm.test")
    monkeypatch.setenv("LITELLM_API_KEY", "test-key")
    monkeypatch.setenv("READER_P2_REASONING_LITELLM_ALIAS", "reader-p2")


def test_extract_parses_markdown_fenced_candidates() -> None:
    payload = {"candidates": []}
    response = _FakeResponse(
        200,
        {
            "choices": [
                {
                    "message": {
                        "content": "```json\n" + json.dumps(payload) + "\n```",
                    },
                    "finish_reason": "stop",
                },
            ],
            "model": "test-model",
        },
    )
    parsed, provenance, error_code, diagnostics = litellm_reasoning.extract_via_litellm(
        pages=[{"page_number": 1, "text": "Student: Alex"}],
        schema_fields=[{"field_key": "student_name", "title": "Name"}],
        intent_text="intent",
        http_client_factory=lambda: _FakeClient(response),
    )
    assert error_code is None
    assert diagnostics is None
    assert parsed == payload
    assert provenance is not None
    assert provenance["litellm_alias"] == "reader-p2"


def test_extract_returns_diagnostics_on_invalid_json() -> None:
    response = _FakeResponse(
        200,
        {
            "choices": [
                {
                    "message": {"content": "not-json"},
                    "finish_reason": "length",
                },
            ],
        },
    )
    parsed, provenance, error_code, diagnostics = litellm_reasoning.extract_via_litellm(
        pages=[{"page_number": 1, "text": "hello"}],
        schema_fields=[{"field_key": "student_name", "title": "Name"}],
        intent_text="intent",
        http_client_factory=lambda: _FakeClient(response),
    )
    assert parsed is None
    assert provenance is None
    assert error_code == "MODEL_OUTPUT_INVALID"
    assert diagnostics == {
        "reason": "message_content_invalid_json",
        "alias": "reader-p2",
        "finish_reason": "length",
        "message_content_length": len("not-json"),
    }


def test_extract_gateway_rejection_diagnostics() -> None:
    response = _FakeResponse(400, {})
    parsed, _provenance, error_code, diagnostics = litellm_reasoning.extract_via_litellm(
        pages=[{"page_number": 1, "text": "hello"}],
        schema_fields=[{"field_key": "student_name", "title": "Name"}],
        intent_text="intent",
        http_client_factory=lambda: _FakeClient(response),
    )
    assert parsed is None
    assert error_code == "MODEL_OUTPUT_INVALID"
    assert diagnostics == {
        "reason": "gateway_rejected",
        "alias": "reader-p2",
        "status": 400,
    }


def test_extract_maps_connection_refusal_to_model_unavailable() -> None:
    connect_error = httpx.ConnectError(
        "Connection refused",
        request=_gateway_post_request(),
    )
    parsed, provenance, error_code, diagnostics = litellm_reasoning.extract_via_litellm(
        pages=[{"page_number": 1, "text": "hello"}],
        schema_fields=[{"field_key": "student_name", "title": "Name"}],
        intent_text="intent",
        http_client_factory=lambda: _RaisingClient(connect_error),
    )
    assert parsed is None
    assert provenance is None
    assert error_code == "MODEL_UNAVAILABLE"
    assert diagnostics == {"reason": "gateway_connection", "alias": "reader-p2"}


def test_extract_maps_gateway_timeout_to_model_timeout() -> None:
    timeout_error = httpx.ReadTimeout(
        "timed out",
        request=_gateway_post_request(),
    )
    parsed, provenance, error_code, diagnostics = litellm_reasoning.extract_via_litellm(
        pages=[{"page_number": 1, "text": "hello"}],
        schema_fields=[{"field_key": "student_name", "title": "Name"}],
        intent_text="intent",
        http_client_factory=lambda: _RaisingClient(timeout_error),
    )
    assert parsed is None
    assert provenance is None
    assert error_code == "MODEL_TIMEOUT"
    assert diagnostics == {"reason": "model_timeout", "alias": "reader-p2"}
