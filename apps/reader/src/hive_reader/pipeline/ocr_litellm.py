import base64
import os
import time
from typing import Callable

import httpx

from hive_reader.quality import normalize_page_text


def litellm_configured() -> bool:
    base = os.environ.get("LITELLM_BASE_URL", "").strip()
    key = os.environ.get("LITELLM_API_KEY", "").strip()
    alias = os.environ.get("READER_OCR_LITELLM_ALIAS", "").strip()
    return bool(base and key and alias)


def ocr_via_litellm(
    image_bytes: bytes,
    page_number: int,
    *,
    http_client_factory: Callable[[], httpx.Client] | None = None,
) -> tuple[str, dict | None, list[str]]:
    issues: list[str] = []
    if not litellm_configured():
        issues.append("OCR_LITELLM_NOT_CONFIGURED")
        return "", None, issues

    base = os.environ["LITELLM_BASE_URL"].rstrip("/")
    alias = os.environ["READER_OCR_LITELLM_ALIAS"]
    api_key = os.environ["LITELLM_API_KEY"]
    b64 = base64.standard_b64encode(image_bytes).decode("ascii")
    payload = {
        "model": alias,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Extract all visible text from this document page. "
                            "Return plain text only, preserving line breaks where obvious."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{b64}"},
                    },
                ],
            }
        ],
        "metadata": {"reader_page_number": page_number},
    }

    client_factory = http_client_factory or (lambda: httpx.Client(timeout=60.0))
    started = time.perf_counter()
    try:
        with client_factory() as client:
            response = client.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
        latency_ms = (time.perf_counter() - started) * 1000.0
        if response.status_code >= 500:
            issues.append("OCR_LITELLM_UNAVAILABLE")
            return "", None, issues
        if response.status_code >= 400:
            issues.append("OCR_LITELLM_REJECTED")
            return "", None, issues
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        if isinstance(content, list):
            text_parts = [part.get("text", "") for part in content if isinstance(part, dict)]
            text = "\n".join(text_parts)
        else:
            text = str(content)
        provenance = {
            "litellm_alias": alias,
            "provider": "litellm",
            "model_id": alias,
            "page_numbers": [page_number],
            "latency_ms": latency_ms,
        }
        return normalize_page_text(text), provenance, issues
    except httpx.TimeoutException:
        issues.append("OCR_LITELLM_TIMEOUT")
        return "", None, issues
    except Exception:
        issues.append("OCR_LITELLM_FAILED")
        return "", None, issues
