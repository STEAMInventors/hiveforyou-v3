import hashlib

import pytest
from fastapi.testclient import TestClient

from hive_reader.config import settings
from hive_reader.main import app


def _minimal_read_body(pdf_bytes: bytes) -> dict:
    path = "33333333-3333-3333-3333-333333333333/22222222-2222-2222-2222-222222222222/doc/sample.pdf"
    return {
        "contract_version": "reader-document-read@1",
        "source": {
            "source_document_id": "11111111-1111-1111-1111-111111111111",
            "hive_id": "22222222-2222-2222-2222-222222222222",
            "owner_user_id": "33333333-3333-3333-3333-333333333333",
            "storage_bucket": "hive3-source-documents",
            "storage_path": path,
            "mime_type": "application/pdf",
            "byte_size": len(pdf_bytes),
            "sha256": hashlib.sha256(pdf_bytes).hexdigest(),
            "filename": "sample.pdf",
        },
    }


def _assert_error_envelope(payload: dict, *, error_code: str, correlation_id: str | None = None) -> None:
    assert payload["contract_version"] == "error-envelope@1"
    assert payload["error_code"] == error_code
    assert "message_safe" in payload
    assert "retryable" in payload
    assert "category" in payload
    if correlation_id is not None:
        assert payload["correlation_id"] == correlation_id


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_read_document_requires_configured_service_token(
    client: TestClient, sample_pdf_bytes: bytes, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "service_token", "")
    response = client.post(
        "/v1/read-document",
        json=_minimal_read_body(sample_pdf_bytes),
        headers={"x-correlation-id": "corr-auth-config"},
    )
    assert response.status_code == 503
    _assert_error_envelope(
        response.json(),
        error_code="DEPENDENCY_UNAVAILABLE",
        correlation_id="corr-auth-config",
    )
    assert response.json()["retryable"] is True
    assert response.json()["category"] == "dependency"


def test_read_document_rejects_missing_bearer(
    client: TestClient, sample_pdf_bytes: bytes, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "service_token", "expected-token")
    response = client.post(
        "/v1/read-document",
        json=_minimal_read_body(sample_pdf_bytes),
        headers={"x-correlation-id": "corr-auth-missing"},
    )
    assert response.status_code == 401
    _assert_error_envelope(
        response.json(),
        error_code="AUTH_FAILED",
        correlation_id="corr-auth-missing",
    )
    assert response.json()["retryable"] is False
    assert response.json()["category"] == "auth"


def test_read_document_rejects_invalid_bearer(
    client: TestClient,
    sample_pdf_bytes: bytes,
    monkeypatch: pytest.MonkeyPatch,
    reader_service_auth_headers: dict[str, str],
) -> None:
    monkeypatch.setattr(settings, "service_token", "expected-token")
    headers = {**reader_service_auth_headers, "Authorization": "Bearer wrong-token", "x-correlation-id": "corr-auth-bad"}
    response = client.post(
        "/v1/read-document",
        json=_minimal_read_body(sample_pdf_bytes),
        headers=headers,
    )
    assert response.status_code == 401
    _assert_error_envelope(
        response.json(),
        error_code="AUTH_FAILED",
        correlation_id="corr-auth-bad",
    )
