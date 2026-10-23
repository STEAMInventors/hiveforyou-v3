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


def _schema(*, field_keys: list[str], match_tier: str = "exact") -> dict:
    return {
        "contract_version": "extraction-schema@1",
        "extraction_schema_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "schema_hash": "abc123",
        "intent_text": "Prepare for IEP meeting",
        "generic": match_tier == "generic",
        "provenance": {
            "match_tier": match_tier,
            "pack_id": "iep" if match_tier != "generic" else None,
            "pack_version": "1.0.0" if match_tier != "generic" else None,
            "pack_digest": "digest" if match_tier != "generic" else None,
            "document_type_id": "iep_initial" if match_tier == "exact" else None,
            "domain_id": "iep" if match_tier != "generic" else None,
        },
        "fields": [
            {
                "field_key": key,
                "title": key,
                "value_type": "string",
                "reusable": key == "student_name",
                "evidence_required": True,
            }
            for key in field_keys
        ],
    }


@pytest.fixture(autouse=True)
def deterministic_extract(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("READER_EXTRACT_DETERMINISTIC", "1")
    monkeypatch.setenv("READER_SERVICE_TOKEN", "test-service-token")


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_extract_candidates_observed_and_missing(client: TestClient) -> None:
    path = "33333333-3333-3333-3333-333333333333/22222222-2222-2222-2222-222222222222/doc/iep.pdf"
    content = b"pdf"
    pages = [
        {
            "page_number": 1,
            "text": "Individualized Education Program\nStudent: Alex Rivera\nIEP Meeting Date: 2024-03-15",
            "extraction_method": "pdf_native",
            "quality": {
                "character_count": 80,
                "identity_text_sufficient": True,
                "issues": [],
            },
        }
    ]
    body = {
        "contract_version": "reader-extract-candidates@1",
        "source": _source(path, "application/pdf", content, "iep.pdf"),
        "pages": pages,
        "read_fingerprint": "read-fp-1",
        "extraction_schema": _schema(field_keys=["student_name", "annual_goals"]),
    }
    response = client.post(
        "/v1/extract-candidates",
        json=body,
        headers={"Authorization": "Bearer test-service-token"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "SUCCEEDED"
    assert payload["extraction"]["field_coverage"]["populated"] >= 1
    assert payload["extraction"]["field_coverage"]["missing"] >= 1
    assert any(
        fact["fact_key"] == "student_name"
        for fact in payload["extraction"]["reusable_source_facts"]
    )


def test_extract_unsupported_page_reference(client: TestClient) -> None:
    path = "33333333-3333-3333-3333-333333333333/22222222-2222-2222-2222-222222222222/doc/x.pdf"
    content = b"x"
    pages = [
        {
            "page_number": 1,
            "text": "Student: Alex Rivera",
            "extraction_method": "pdf_native",
            "quality": {
                "character_count": 20,
                "identity_text_sufficient": True,
                "issues": [],
            },
        }
    ]
    body = {
        "contract_version": "reader-extract-candidates@1",
        "source": _source(path, "application/pdf", content, "x.pdf"),
        "pages": pages,
        "read_fingerprint": "read-fp-2",
        "extraction_schema": _schema(field_keys=["student_name"]),
    }
    response = client.post(
        "/v1/extract-candidates",
        json=body,
        headers={"Authorization": "Bearer test-service-token"},
    )
    assert response.status_code == 200
    candidate = response.json()["extraction"]["candidates"][0]
    assert candidate["status"] == "observed"
    assert candidate["evidence"][0]["quote_verified"] is True


def test_fixture_extraction_requires_pytest(monkeypatch: pytest.MonkeyPatch) -> None:
    from hive_reader.extract.deterministic import fixture_extraction_enabled

    monkeypatch.setenv("READER_EXTRACT_DETERMINISTIC", "1")
    assert fixture_extraction_enabled() is True
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    assert fixture_extraction_enabled() is False
    monkeypatch.setenv("PYTEST_CURRENT_TEST", "tests/test_extract_candidates.py::fixture")
    assert fixture_extraction_enabled() is True
    monkeypatch.setenv("READER_EXTRACT_DETERMINISTIC", "0")
    assert fixture_extraction_enabled() is False


def test_deterministic_flag_ignored_outside_pytest(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("READER_EXTRACT_DETERMINISTIC", "1")
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.delenv("READER_P2_REASONING_LITELLM_ALIAS", raising=False)
    monkeypatch.delenv("LITELLM_BASE_URL", raising=False)
    monkeypatch.delenv("LITELLM_API_KEY", raising=False)
    path = "33333333-3333-3333-3333-333333333333/22222222-2222-2222-2222-222222222222/doc/x.pdf"
    content = b"x"
    body = {
        "contract_version": "reader-extract-candidates@1",
        "source": _source(path, "application/pdf", content, "x.pdf"),
        "pages": [
            {
                "page_number": 1,
                "text": "Student: Alex Rivera",
                "extraction_method": "pdf_native",
                "quality": {
                    "character_count": 20,
                    "identity_text_sufficient": True,
                    "issues": [],
                },
            }
        ],
        "read_fingerprint": "read-fp-det",
        "extraction_schema": _schema(field_keys=["student_name"]),
    }
    response = client.post(
        "/v1/extract-candidates",
        json=body,
        headers={"Authorization": "Bearer test-service-token"},
    )
    assert response.status_code == 503
    assert response.json()["error_code"] == "DEPENDENCY_UNAVAILABLE"


def test_extract_requires_reasoning_alias_without_deterministic(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("READER_EXTRACT_DETERMINISTIC", raising=False)
    monkeypatch.delenv("READER_P2_REASONING_LITELLM_ALIAS", raising=False)
    path = "33333333-3333-3333-3333-333333333333/22222222-2222-2222-2222-222222222222/doc/x.pdf"
    content = b"x"
    body = {
        "contract_version": "reader-extract-candidates@1",
        "source": _source(path, "application/pdf", content, "x.pdf"),
        "pages": [
            {
                "page_number": 1,
                "text": "hello",
                "extraction_method": "pdf_native",
                "quality": {
                    "character_count": 5,
                    "identity_text_sufficient": True,
                    "issues": [],
                },
            }
        ],
        "read_fingerprint": "read-fp-3",
        "extraction_schema": _schema(field_keys=["student_name"]),
    }
    response = client.post(
        "/v1/extract-candidates",
        json=body,
        headers={"Authorization": "Bearer test-service-token"},
    )
    assert response.status_code == 503
    assert response.json()["error_code"] == "DEPENDENCY_UNAVAILABLE"


def test_invalid_model_json(monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio

    from hive_reader.extract import service as extract_service
    from hive_reader.models import (
        ExtractionSchema,
        ExtractionSchemaField,
        ExtractionSchemaProvenance,
        ReaderExtractCandidatesRequest,
        ReaderPageQuality,
        ReaderReadDocumentPage,
        ReaderReadDocumentSource,
    )
    from hive_reader.pipeline.router import ExtractionError

    monkeypatch.delenv("READER_EXTRACT_DETERMINISTIC", raising=False)

    def _bad_model(**_: object) -> tuple[dict | None, dict | None, str | None, dict | None]:
        return (
            {"not_candidates": True},
            {
                "litellm_alias": "x",
                "provider": "p",
                "model_id": "m",
                "page_numbers": [1],
                "latency_ms": 1.0,
            },
            None,
            None,
        )

    monkeypatch.setattr(extract_service, "extract_via_litellm", _bad_model)
    monkeypatch.setenv("READER_P2_REASONING_LITELLM_ALIAS", "test-alias")

    request = ReaderExtractCandidatesRequest(
        contract_version="reader-extract-candidates@1",
        source=ReaderReadDocumentSource(
            source_document_id="11111111-1111-1111-1111-111111111111",
            hive_id="22222222-2222-2222-2222-222222222222",
            owner_user_id="33333333-3333-3333-3333-333333333333",
            storage_bucket="hive3-source-documents",
            storage_path="a/b/c.pdf",
            mime_type="application/pdf",
            byte_size=1,
            sha256="a" * 64,
            filename="c.pdf",
        ),
        pages=[
            ReaderReadDocumentPage(
                page_number=1,
                text="Student: Alex",
                extraction_method="pdf_native",
                quality=ReaderPageQuality(
                    character_count=10,
                    identity_text_sufficient=True,
                    issues=[],
                ),
            )
        ],
        read_fingerprint="fp",
        extraction_schema=ExtractionSchema(
            contract_version="extraction-schema@1",
            extraction_schema_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            schema_hash="hash",
            intent_text="intent",
            generic=False,
            provenance=ExtractionSchemaProvenance(match_tier="exact"),
            fields=[
                ExtractionSchemaField(
                    field_key="student_name",
                    title="Student",
                    value_type="string",
                )
            ],
        ),
    )

    with pytest.raises(ExtractionError) as exc:
        asyncio.run(extract_service.extract_candidates(request))
    assert exc.value.code == "MODEL_OUTPUT_INVALID"
    assert exc.value.log_diagnostics is None


def test_extract_candidates_model_json_failure_returns_422(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("READER_EXTRACT_DETERMINISTIC", raising=False)
    monkeypatch.setenv("READER_P2_REASONING_LITELLM_ALIAS", "reader-p2")
    monkeypatch.setenv("LITELLM_BASE_URL", "http://litellm.test")
    monkeypatch.setenv("LITELLM_API_KEY", "test-key")

    from hive_reader.extract import service as extract_service

    def _invalid(**_: object) -> tuple[dict | None, dict | None, str | None, dict | None]:
        return (
            None,
            None,
            "MODEL_OUTPUT_INVALID",
            {
                "reason": "message_content_invalid_json",
                "alias": "reader-p2",
                "finish_reason": "length",
                "message_content_length": 12,
            },
        )

    monkeypatch.setattr(extract_service, "extract_via_litellm", _invalid)

    path = "33333333-3333-3333-3333-333333333333/22222222-2222-2222-2222-222222222222/doc/x.pdf"
    body = {
        "contract_version": "reader-extract-candidates@1",
        "source": _source(path, "application/pdf", b"x", "x.pdf"),
        "pages": [
            {
                "page_number": 1,
                "text": "Student: Alex Rivera",
                "extraction_method": "pdf_native",
                "quality": {
                    "character_count": 20,
                    "identity_text_sufficient": True,
                    "issues": [],
                },
            }
        ],
        "read_fingerprint": "read-fp-json-fail",
        "extraction_schema": _schema(field_keys=["student_name"]),
    }
    response = client.post(
        "/v1/extract-candidates",
        json=body,
        headers={
            "Authorization": "Bearer test-service-token",
            "x-correlation-id": "corr-json-fail",
            "x-study-run-id": "55555555-5555-5555-5555-555555555555",
        },
    )
    assert response.status_code == 422
    payload = response.json()
    assert payload["error_code"] == "MODEL_OUTPUT_INVALID"
    assert payload["correlation_id"] == "corr-json-fail"
    assert "reason" not in payload
    assert "message_content_length" not in payload


def test_validate_flags_unsupported_page_reference() -> None:
    from hive_reader.extract.validate import validate_candidate_evidence
    from hive_reader.models import CandidateEvidence

    evidence, issues = validate_candidate_evidence(
        1,
        [CandidateEvidence(page_number=9, exact_quote="nowhere", quote_verified=True)],
    )
    assert "UNSUPPORTED_PAGE_REFERENCE" in issues
    assert evidence[0].quote_verified is False
