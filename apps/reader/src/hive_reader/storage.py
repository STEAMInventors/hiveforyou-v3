import hashlib

import httpx

from hive_reader.config import settings


class StorageError(Exception):
    def __init__(self, code: str, message: str, retryable: bool) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable


def expected_storage_prefix(owner_user_id: str, hive_id: str) -> str:
    return f"{owner_user_id.strip()}/{hive_id.strip()}/"


def assert_storage_path_allowed(storage_path: str, owner_user_id: str, hive_id: str) -> None:
    prefix = expected_storage_prefix(owner_user_id, hive_id)
    normalized = storage_path.strip().lstrip("/")
    if not normalized.startswith(prefix):
        raise StorageError("ACCESS_DENIED", "Storage path is not allowed for this source.", False)


def verify_sha256(content: bytes, expected_sha256: str) -> bool:
    digest = hashlib.sha256(content).hexdigest()
    return digest.lower() == expected_sha256.strip().lower()


async def download_storage_object(bucket: str, storage_path: str) -> bytes:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise StorageError(
            "STORAGE_UNAVAILABLE",
            "Storage credentials are not configured.",
            True,
        )

    url = (
        f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{bucket}/{storage_path.lstrip('/')}"
    )
    headers = {
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "apikey": settings.supabase_service_role_key,
    }
    try:
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            response = await client.get(url, headers=headers)
    except httpx.TimeoutException as exc:
        raise StorageError("STORAGE_UNAVAILABLE", "Storage request timed out.", True) from exc
    except httpx.HTTPError as exc:
        raise StorageError("STORAGE_UNAVAILABLE", "Storage is unavailable.", True) from exc

    if response.status_code == 404:
        raise StorageError("STORAGE_NOT_FOUND", "Document object was not found.", False)
    if response.status_code >= 500:
        raise StorageError("STORAGE_UNAVAILABLE", "Storage is unavailable.", True)
    if response.status_code >= 400:
        raise StorageError("ACCESS_DENIED", "Storage access was denied.", False)

    content = response.content
    if len(content) == 0:
        raise StorageError("STORAGE_NOT_FOUND", "Document object was empty.", False)
    return content
