import logging
import uuid

from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse

from hive_reader.auth import ServiceAuthError, require_service_token
from hive_reader.errors import error_response
from hive_reader.extract.service import extract_candidates
from hive_reader.models import ReaderExtractCandidatesRequest, ReaderReadDocumentRequest
from hive_reader.pipeline.router import ExtractionError
from hive_reader.service import read_document
from hive_reader.storage import StorageError

logger = logging.getLogger("hive_reader")

app = FastAPI(title="HiveForYou Reader", version="0.1.0")


@app.exception_handler(ServiceAuthError)
async def service_auth_error_handler(
    request: Request,
    exc: ServiceAuthError,
) -> JSONResponse:
    from hive_reader.errors import error_response

    correlation_id = _correlation_id(request.headers.get("x-correlation-id"))
    study_run_id = (request.headers.get("x-study-run-id") or "").strip() or None
    failure = exc.failure
    return error_response(
        status_code=failure.status_code,
        error_code=failure.error_code,
        category=failure.category,
        retryable=failure.retryable,
        message_safe=failure.message_safe,
        correlation_id=correlation_id,
        study_run_id=study_run_id,
        stage=None,
    )


def _correlation_id(raw: str | None) -> str:
    trimmed = (raw or "").strip()
    if trimmed and len(trimmed) <= 128:
        return trimmed
    return str(uuid.uuid4())


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/read-document")
async def read_document_route(
    request: Request,
    body: ReaderReadDocumentRequest,
    _: None = Depends(require_service_token),
    x_correlation_id: str | None = Header(default=None, alias="x-correlation-id"),
    x_study_run_id: str | None = Header(default=None, alias="x-study-run-id"),
    x_extraction_batch_id: str | None = Header(default=None, alias="x-extraction-batch-id"),
):
    correlation_id = _correlation_id(x_correlation_id)
    study_run_id = (x_study_run_id or "").strip() or None

    if body.contract_version != "reader-document-read@1":
        return error_response(
            status_code=400,
            error_code="INVALID_REQUEST",
            category="validation",
            retryable=False,
            message_safe="Unsupported contract version.",
            correlation_id=correlation_id,
            study_run_id=study_run_id,
        )

    logger.info(
        "read_document_start",
        extra={
            "correlation_id": correlation_id,
            "study_run_id": study_run_id,
            "extraction_batch_id": (x_extraction_batch_id or "").strip() or None,
            "source_document_id": body.source.source_document_id,
            "hive_id": body.source.hive_id,
            "stage": "extract",
        },
    )

    try:
        result = await read_document(body)
        logger.info(
            "read_document_success",
            extra={
                "correlation_id": correlation_id,
                "study_run_id": study_run_id,
                "page_count": result.page_count,
                "stage": "extract",
            },
        )
        return result
    except StorageError as exc:
        status = 503 if exc.retryable else 404 if exc.code == "STORAGE_NOT_FOUND" else 403
        category = "storage" if exc.code.startswith("STORAGE") else "authorization"
        return error_response(
            status_code=status,
            error_code=exc.code,
            category=category,
            retryable=exc.retryable,
            message_safe=exc.message,
            correlation_id=correlation_id,
            study_run_id=study_run_id,
        )
    except ExtractionError as exc:
        code = exc.code
        retryable = code in {"MODEL_UNAVAILABLE", "MODEL_TIMEOUT", "DEPENDENCY_UNAVAILABLE"}
        category = (
            "dependency"
            if code == "DEPENDENCY_UNAVAILABLE"
            else "model"
            if code.startswith("MODEL")
            else "validation"
            if code == "INVALID_REQUEST"
            else "processing"
        )
        status = (
            503
            if retryable
            else 400
            if code == "INVALID_REQUEST"
            else 422
        )
        return error_response(
            status_code=status,
            error_code=code,
            category=category,
            retryable=retryable,
            message_safe=exc.message,
            correlation_id=correlation_id,
            study_run_id=study_run_id,
        )


@app.post("/v1/extract-candidates")
async def extract_candidates_route(
    request: Request,
    body: ReaderExtractCandidatesRequest,
    _: None = Depends(require_service_token),
    x_correlation_id: str | None = Header(default=None, alias="x-correlation-id"),
    x_study_run_id: str | None = Header(default=None, alias="x-study-run-id"),
    x_extraction_batch_id: str | None = Header(default=None, alias="x-extraction-batch-id"),
):
    correlation_id = _correlation_id(x_correlation_id)
    study_run_id = (x_study_run_id or "").strip() or None

    logger.info(
        "extract_candidates_start",
        extra={
            "correlation_id": correlation_id,
            "study_run_id": study_run_id,
            "extraction_batch_id": (x_extraction_batch_id or "").strip() or None,
            "source_document_id": body.source.source_document_id,
            "schema_hash": body.extraction_schema.schema_hash,
            "match_tier": body.extraction_schema.provenance.match_tier,
            "pack_digest": body.extraction_schema.provenance.pack_digest,
            "stage": "extract",
        },
    )

    try:
        result = await extract_candidates(body)
        model_call = result.provenance.model_calls[0] if result.provenance.model_calls else None
        logger.info(
            "extract_candidates_success",
            extra={
                "correlation_id": correlation_id,
                "study_run_id": study_run_id,
                "schema_hash": result.extraction.schema_hash,
                "match_tier": body.extraction_schema.provenance.match_tier,
                "pack_digest": body.extraction_schema.provenance.pack_digest,
                "model_alias": model_call.litellm_alias if model_call else None,
                "duration_ms": model_call.latency_ms if model_call else None,
                "populated": result.extraction.field_coverage.get("populated"),
                "stage": "extract",
            },
        )
        return result
    except ExtractionError as exc:
        code = exc.code
        retryable = code in {"MODEL_UNAVAILABLE", "MODEL_TIMEOUT", "DEPENDENCY_UNAVAILABLE"}
        category = (
            "dependency"
            if code == "DEPENDENCY_UNAVAILABLE"
            else "model"
            if code.startswith("MODEL")
            else "validation"
            if code == "INVALID_REQUEST"
            else "processing"
        )
        status = (
            503
            if retryable
            else 400
            if code == "INVALID_REQUEST"
            else 422
        )
        failure_extra: dict[str, object] = {
            "correlation_id": correlation_id,
            "study_run_id": study_run_id,
            "schema_hash": body.extraction_schema.schema_hash,
            "match_tier": body.extraction_schema.provenance.match_tier,
            "pack_digest": body.extraction_schema.provenance.pack_digest,
            "error_code": code,
            "retryable": retryable,
            "message_safe": exc.message,
            "stage": "extract",
        }
        if exc.log_diagnostics:
            failure_extra.update(exc.log_diagnostics)
        logger.warning("extract_candidates_failed", extra=failure_extra)
        return error_response(
            status_code=status,
            error_code=code,
            category=category,
            retryable=retryable,
            message_safe=exc.message,
            correlation_id=correlation_id,
            study_run_id=study_run_id,
        )
