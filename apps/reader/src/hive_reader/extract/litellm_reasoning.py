import json
import os
import time
from typing import Any, Callable

import httpx


def reasoning_configured() -> bool:
    base = os.environ.get("LITELLM_BASE_URL", "").strip()
    key = os.environ.get("LITELLM_API_KEY", "").strip()
    alias = os.environ.get("READER_P2_REASONING_LITELLM_ALIAS", "").strip()
    return bool(base and key and alias)


def extract_via_litellm(
    *,
    pages: list[dict[str, Any]],
    schema_fields: list[dict[str, Any]],
    intent_text: str,
    http_client_factory: Callable[[], httpx.Client] | None = None,
) -> tuple[dict[str, Any] | None, dict | None, str | None]:
    if not reasoning_configured():
        return None, None, "P2_REASONING_NOT_CONFIGURED"

    base = os.environ["LITELLM_BASE_URL"].rstrip("/")
    alias = os.environ["READER_P2_REASONING_LITELLM_ALIAS"]
    api_key = os.environ["LITELLM_API_KEY"]

    page_blocks = []
    for page in pages:
        page_blocks.append(
            f"--- Page {page['page_number']} ---\n{page['text'][:12000]}",
        )

    field_list = [
        {
            "field_key": field["field_key"],
            "title": field["title"],
            "value_type": field.get("value_type", "string"),
            "required": field.get("required", False),
        }
        for field in schema_fields
    ]

    system_prompt = (
        "You extract schema-bound candidate facts from document page text. "
        "Return JSON only with shape: "
        '{"candidates":[{"field_key","status","value_json","evidence":[{"page_number","exact_quote"}]}]}. '
        "status must be observed|missing|unknown|unreadable. "
        "Never invent values; use missing or unknown when absent. "
        "Every observed value needs a verbatim exact_quote from the given page text."
    )
    user_prompt = json.dumps(
        {
            "intent_text": intent_text,
            "fields": field_list,
            "pages": page_blocks,
        },
        ensure_ascii=False,
    )

    payload = {
        "model": alias,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }

    client_factory = http_client_factory or (lambda: httpx.Client(timeout=90.0))
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
            return None, None, "MODEL_UNAVAILABLE"
        if response.status_code >= 400:
            return None, None, "MODEL_OUTPUT_INVALID"
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(content) if isinstance(content, str) else content
        provenance = {
            "litellm_alias": alias,
            "provider": data.get("provider", "litellm"),
            "model_id": data.get("model", alias),
            "page_numbers": [page["page_number"] for page in pages],
            "latency_ms": latency_ms,
        }
        return parsed, provenance, None
    except (json.JSONDecodeError, KeyError, TypeError):
        return None, None, "MODEL_OUTPUT_INVALID"
    except httpx.TimeoutException:
        return None, None, "MODEL_TIMEOUT"
