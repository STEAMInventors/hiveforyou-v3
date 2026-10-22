import hashlib

import pytest
from fastapi.testclient import TestClient

from hive_reader.main import app


def _source(storage_path: str, mime: str, content: bytes, filename: str) -> dict:
    return {
        "source_document_id": "11111111-1111-1111-1111-111111111111",
        "hive_id": "22222222-2222-2222-2222-222222222222",
        "owner_user_id": "33333333-3333-3333-3333-333333333333",
        "storage_bucket": "hive3-source-documents",
        "storage_path": storage_path,
        "mime_type": mime,
        "byte_size": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
        "filename": filename,
    }


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_rejects_schema_slot(client: TestClient, sample_pdf_bytes: bytes) -> None:
    path = "33333333-3333-3333-3333-333333333333/22222222-2222-2222-2222-222222222222/doc/sample.pdf"
    body = {
        "contract_version": "reader-document-read@1",
        "source": _source(path, "application/pdf", sample_pdf_bytes, "sample.pdf"),
        "extraction_schema": {"schema_json": {"type": "object"}},
    }
    response = client.post(
        "/v1/read-document",
        json=body,
        headers={
            "Authorization": "Bearer test-service-token",
            "x-correlation-id": "corr-test",
            "x-study-run-id": "run-test",
            "x-extraction-batch-id": "batch-test",
        },
    )
    assert response.status_code == 400
    payload = response.json()
    assert payload["contract_version"] == "error-envelope@1"
    assert payload["error_code"] == "INVALID_REQUEST"


def test_rejects_bad_storage_prefix(client: TestClient, sample_pdf_bytes: bytes) -> None:
    body = {
        "contract_version": "reader-document-read@1",
        "source": _source(
            "other-user/hive/doc.pdf",
            "application/pdf",
            sample_pdf_bytes,
            "sample.pdf",
        ),
    }
    response = client.post(
        "/v1/read-document",
        json=body,
        headers={
            "Authorization": "Bearer test-service-token",
            "x-correlation-id": "c1",
        },
    )
    assert response.status_code == 403
    assert response.json()["error_code"] == "ACCESS_DENIED"
