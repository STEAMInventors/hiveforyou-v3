import json
import os
import time
from typing import Any, Callable

import httpx

from hive_reader.extract.litellm_completion_json import (
    LiteLlmJsonExtractErr,
    extract_json_from_litellm_completion,
    measure_litellm_message_content_length,
)

ALLOWED_FINISH_REASONS = frozenset(
    {"stop", "length", "content_filter", "tool_calls", "function_call"},
)

ModelOutputDiagnostics = dict[str, str | int | float | bool | None]


def reasoning_configured() -> bool:
    base = os.environ.get("LITELLM_BASE_URL", "").strip()
    key = os.environ.get("LITELLM_API_KEY", "").strip()
    alias = os.environ.get("READER_P2_REASONING_LITELLM_ALIAS", "").strip()
    return bool(base and key and alias)


def _allowlisted_finish_reason(data: Any) -> str | None:
    if not isinstance(data, dict):
        return None
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        return None
    finish_reason = choices[0].get("finish_reason")
    if not isinstance(finish_reason, str) or finish_reason not in ALLOWED_FINISH_REASONS:
        return None
    return finish_reason


def _model_output_invalid_diagnostics(
    data: Any,
    reason: str,
    alias: str,
) -> ModelOutputDiagnostics:
    diagnostics: ModelOutputDiagnostics = {"reason": reason, "alias": alias}
    finish_reason = _allowlisted_finish_reason(data)
    if finish_reason:
        diagnostics["finish_reason"] = finish_reason
    content_length = measure_litellm_message_content_length(data)
    if content_length is not None:
        diagnostics["message_content_length"] = content_length
    return diagnostics


def extract_via_litellm(
    *,
    pages: list[dict[str, Any]],
    schema_fields: list[dict[str, Any]],
    intent_text: str,
    field_guidance: list[dict[str, Any]] | None = None,
    http_client_factory: Callable[[], httpx.Client] | None = None,
) -> tuple[
    dict[str, Any] | None,
    dict | None,
    str | None,
    ModelOutputDiagnostics | None,
]:
    if not reasoning_configured():
        return None, None, "P2_REASONING_NOT_CONFIGURED", None

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
    guidance_payload = field_guidance or []
    user_prompt = json.dumps(
        {
            "intent_text": intent_text,
            "fields": field_list,
            "field_guidance": guidance_payload,
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
        if response.status_code >= 500 or response.status_code == 429:
            return None, None, "MODEL_UNAVAILABLE", {"reason": "gateway_status", "alias": alias}
        if response.status_code >= 400:
            return (
                None,
                None,
                "MODEL_OUTPUT_INVALID",
                {
                    "reason": "gateway_rejected",
                    "alias": alias,
                    "status": response.status_code,
                },
            )
        try:
            data = response.json()
        except json.JSONDecodeError:
            return (
                None,
                None,
                "MODEL_OUTPUT_INVALID",
                {"reason": "gateway_response_not_json", "alias": alias},
            )

        extracted = extract_json_from_litellm_completion(data)
        if isinstance(extracted, LiteLlmJsonExtractErr):
            return (
                None,
                None,
                "MODEL_OUTPUT_INVALID",
                _model_output_invalid_diagnostics(data, extracted.reason, alias),
            )

        parsed = extracted.parsed
        if not isinstance(parsed, dict):
            return (
                None,
                None,
                "MODEL_OUTPUT_INVALID",
                _model_output_invalid_diagnostics(
                    data,
                    "message_content_not_object",
                    alias,
                ),
            )

        provenance = {
            "litellm_alias": alias,
            "provider": data.get("provider", "litellm"),
            "model_id": data.get("model", alias),
            "page_numbers": [page["page_number"] for page in pages],
            "latency_ms": latency_ms,
        }
        return parsed, provenance, None, None
    except httpx.TimeoutException:
        return None, None, "MODEL_TIMEOUT", {"reason": "model_timeout", "alias": alias}
    except httpx.ConnectError:
        return None, None, "MODEL_UNAVAILABLE", {"reason": "gateway_connection", "alias": alias}
    except httpx.RequestError:
        return None, None, "MODEL_UNAVAILABLE", {"reason": "gateway_request_failed", "alias": alias}
    except (KeyError, TypeError):
        return (
            None,
            None,
            "MODEL_OUTPUT_INVALID",
            {"reason": "gateway_response_invalid_envelope", "alias": alias},
        )
