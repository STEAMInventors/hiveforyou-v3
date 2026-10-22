from hive_reader.pipeline.ocr_litellm import ocr_via_litellm


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


def test_litellm_ocr_success(monkeypatch) -> None:
    monkeypatch.setenv("LITELLM_BASE_URL", "http://litellm.test")
    monkeypatch.setenv("LITELLM_API_KEY", "test-key")
    monkeypatch.setenv("READER_OCR_LITELLM_ALIAS", "reader-ocr")

    response = _FakeResponse(
        200,
        {"choices": [{"message": {"content": "Receipt total 12.34 with enough identity text."}}]},
    )

    text, provenance, issues = ocr_via_litellm(
        b"\x89PNG\r\n\x1a\n",
        1,
        http_client_factory=lambda: _FakeClient(response),
    )
    assert "Receipt" in text
    assert provenance is not None
    assert provenance["litellm_alias"] == "reader-ocr"
    assert issues == []


def test_litellm_not_configured(monkeypatch) -> None:
    monkeypatch.delenv("LITELLM_BASE_URL", raising=False)
    text, provenance, issues = ocr_via_litellm(b"abc", 1)
    assert text == ""
    assert provenance is None
    assert "OCR_LITELLM_NOT_CONFIGURED" in issues
