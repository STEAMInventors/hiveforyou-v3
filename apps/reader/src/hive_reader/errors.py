from fastapi.responses import JSONResponse

from hive_reader.models import ErrorEnvelopeV1


def error_response(
    *,
    status_code: int,
    error_code: str,
    category: str,
    retryable: bool,
    message_safe: str,
    correlation_id: str,
    study_run_id: str | None = None,
    stage: str | None = "extract",
) -> JSONResponse:
    body = ErrorEnvelopeV1(
        contract_version="error-envelope@1",
        error_code=error_code,
        category=category,
        retryable=retryable,
        message_safe=message_safe,
        correlation_id=correlation_id,
        study_run_id=study_run_id,
        stage=stage,
    )
    return JSONResponse(status_code=status_code, content=body.model_dump(exclude_none=True))
