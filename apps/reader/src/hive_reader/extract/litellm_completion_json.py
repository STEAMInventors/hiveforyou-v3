"""Parse structured JSON from OpenAI-compatible LiteLLM chat completion bodies.

Rules mirror apps/worker/src/reasoning/litellm-completion-json.ts.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Literal

LiteLlmJsonExtractFailureReason = Literal[
    "missing_message_content",
    "message_content_invalid_json",
    "message_content_not_object",
    "message_content_ambiguous_json",
    "tool_call_arguments_invalid_json",
    "tool_call_arguments_not_object",
]

MARKDOWN_FENCE_PATTERN = re.compile(r"```(?:json)?\s*([\s\S]*?)\s*```", re.IGNORECASE)


@dataclass(frozen=True)
class LiteLlmJsonExtractOk:
    ok: Literal[True] = True
    parsed: Any = None


@dataclass(frozen=True)
class LiteLlmJsonExtractErr:
    ok: Literal[False] = False
    reason: LiteLlmJsonExtractFailureReason = "missing_message_content"


LiteLlmJsonExtractResult = LiteLlmJsonExtractOk | LiteLlmJsonExtractErr


def _is_json_object_value(parsed: Any) -> bool:
    return isinstance(parsed, dict)


def _success_object(parsed: Any) -> LiteLlmJsonExtractResult:
    if not _is_json_object_value(parsed):
        return LiteLlmJsonExtractErr(reason="message_content_not_object")
    return LiteLlmJsonExtractOk(parsed=parsed)


def _try_parse_json_object_literal(text: str) -> LiteLlmJsonExtractResult | None:
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not _is_json_object_value(parsed):
        return LiteLlmJsonExtractErr(reason="message_content_not_object")
    return LiteLlmJsonExtractOk(parsed=parsed)


def _parse_from_markdown_fences(text: str) -> LiteLlmJsonExtractResult | None:
    matches = list(MARKDOWN_FENCE_PATTERN.finditer(text))
    if not matches:
        return None
    if len(matches) > 1:
        return LiteLlmJsonExtractErr(reason="message_content_ambiguous_json")
    inner = (matches[0].group(1) or "").strip()
    if not inner:
        return LiteLlmJsonExtractErr(reason="message_content_invalid_json")
    parsed = _try_parse_json_object_literal(inner)
    if parsed is None:
        return LiteLlmJsonExtractErr(reason="message_content_invalid_json")
    return parsed


def _find_matching_close_brace(text: str, open_index: int) -> int | None:
    depth = 0
    in_string = False
    escape = False
    for i in range(open_index, len(text)):
        char = text[i]
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return i
    return None


def _find_complete_json_object_spans(text: str) -> list[tuple[int, int, Any]]:
    spans: list[tuple[int, int, Any]] = []
    for i, char in enumerate(text):
        if char != "{":
            continue
        close = _find_matching_close_brace(text, i)
        if close is None:
            continue
        slice_text = text[i : close + 1]
        parsed = _try_parse_json_object_literal(slice_text)
        if isinstance(parsed, LiteLlmJsonExtractOk):
            spans.append((i, close + 1, parsed.parsed))
    return spans


def _parse_json_text(text: str) -> LiteLlmJsonExtractResult:
    trimmed = text.strip()
    if not trimmed:
        return LiteLlmJsonExtractErr(reason="missing_message_content")

    direct = _try_parse_json_object_literal(trimmed)
    if direct is not None:
        return direct

    fenced = _parse_from_markdown_fences(trimmed)
    if fenced is not None:
        return fenced

    spans = _find_complete_json_object_spans(trimmed)
    if len(spans) > 1:
        return LiteLlmJsonExtractErr(reason="message_content_ambiguous_json")
    if len(spans) == 1:
        start, end, parsed = spans[0]
        before = trimmed[:start].strip()
        after = trimmed[end:].strip()
        if before or after:
            return LiteLlmJsonExtractErr(reason="message_content_ambiguous_json")
        return _success_object(parsed)

    return LiteLlmJsonExtractErr(reason="message_content_invalid_json")


def _text_from_content_blocks(blocks: list[Any]) -> str | None:
    parts: list[str] = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text":
            text = block.get("text")
            if isinstance(text, str) and text:
                parts.append(text)
    if not parts:
        return None
    return "".join(parts)


def _parse_message_content(content: Any) -> LiteLlmJsonExtractResult | None:
    if content is None:
        return None
    if isinstance(content, str):
        trimmed = content.strip()
        if not trimmed:
            return LiteLlmJsonExtractErr(reason="missing_message_content")
        return _parse_json_text(trimmed)
    if isinstance(content, list):
        text = _text_from_content_blocks(content)
        if not text:
            return LiteLlmJsonExtractErr(reason="missing_message_content")
        return _parse_json_text(text.strip())
    if isinstance(content, dict):
        return LiteLlmJsonExtractOk(parsed=content)
    return LiteLlmJsonExtractErr(reason="message_content_not_object")


def _parse_tool_call_arguments(tool_calls: Any) -> LiteLlmJsonExtractResult | None:
    if not isinstance(tool_calls, list) or not tool_calls:
        return None
    first = tool_calls[0]
    if not isinstance(first, dict):
        return None
    fn = first.get("function")
    if not isinstance(fn, dict):
        return None
    args = fn.get("arguments")
    if not isinstance(args, str) or not args.strip():
        return LiteLlmJsonExtractErr(reason="missing_message_content")
    try:
        parsed = json.loads(args)
    except json.JSONDecodeError:
        return LiteLlmJsonExtractErr(reason="tool_call_arguments_invalid_json")
    if not _is_json_object_value(parsed):
        return LiteLlmJsonExtractErr(reason="tool_call_arguments_not_object")
    return LiteLlmJsonExtractOk(parsed=parsed)


def measure_litellm_message_content_length(data: Any) -> int | None:
    if not isinstance(data, dict):
        return None
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        return None
    message = choices[0].get("message")
    if not isinstance(message, dict):
        return None
    content = message.get("content")
    if isinstance(content, str):
        return len(content)
    if isinstance(content, list):
        text = _text_from_content_blocks(content)
        return len(text) if text else None
    return None


def extract_json_from_litellm_completion(data: Any) -> LiteLlmJsonExtractResult:
    if not isinstance(data, dict):
        return LiteLlmJsonExtractErr(reason="missing_message_content")
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        return LiteLlmJsonExtractErr(reason="missing_message_content")
    message = choices[0].get("message")
    if not isinstance(message, dict):
        return LiteLlmJsonExtractErr(reason="missing_message_content")

    from_content = _parse_message_content(message.get("content"))
    if isinstance(from_content, LiteLlmJsonExtractOk):
        return from_content

    from_tool = _parse_tool_call_arguments(message.get("tool_calls"))
    if isinstance(from_tool, LiteLlmJsonExtractOk):
        return from_tool

    if isinstance(from_content, LiteLlmJsonExtractErr):
        return from_content
    if isinstance(from_tool, LiteLlmJsonExtractErr):
        return from_tool

    return LiteLlmJsonExtractErr(reason="missing_message_content")
