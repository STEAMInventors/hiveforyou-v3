from dataclasses import dataclass

from fastapi import Header


@dataclass(frozen=True)
class ServiceAuthFailure:
    status_code: int
    error_code: str
    category: str
    retryable: bool
    message_safe: str


class ServiceAuthError(Exception):
    def __init__(self, failure: ServiceAuthFailure) -> None:
        super().__init__(failure.message_safe)
        self.failure = failure


def require_service_token(authorization: str | None = Header(default=None)) -> None:
    from hive_reader.config import settings

    if not settings.service_token.strip():
        raise ServiceAuthError(
            ServiceAuthFailure(
                status_code=503,
                error_code="DEPENDENCY_UNAVAILABLE",
                category="dependency",
                retryable=True,
                message_safe="Reader service authentication is not configured.",
            )
        )
    if not authorization or not authorization.startswith("Bearer "):
        raise ServiceAuthError(
            ServiceAuthFailure(
                status_code=401,
                error_code="AUTH_FAILED",
                category="auth",
                retryable=False,
                message_safe="Authentication required.",
            )
        )
    token = authorization.removeprefix("Bearer ").strip()
    if token != settings.service_token:
        raise ServiceAuthError(
            ServiceAuthFailure(
                status_code=401,
                error_code="AUTH_FAILED",
                category="auth",
                retryable=False,
                message_safe="Authentication failed.",
            )
        )
