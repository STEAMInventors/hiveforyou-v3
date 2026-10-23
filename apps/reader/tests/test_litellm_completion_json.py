import json

from hive_reader.extract.litellm_completion_json import (
    extract_json_from_litellm_completion,
    measure_litellm_message_content_length,
)


def test_parses_string_message_content() -> None:
    result = extract_json_from_litellm_completion(
        {"choices": [{"message": {"content": json.dumps({"ok": True})}}]},
    )
    assert result.ok is True
    assert result.parsed == {"ok": True}


def test_parses_json_enclosed_in_markdown_fence() -> None:
    payload = {"candidates": [{"field_key": "a"}]}
    result = extract_json_from_litellm_completion(
        {
            "choices": [
                {
                    "message": {
                        "content": "```json\n" + json.dumps(payload) + "\n```",
                    },
                },
            ],
        },
    )
    assert result.ok is True
    assert result.parsed == payload


def test_parses_fenced_object_with_prose_outside_fence() -> None:
    payload = {"ok": True}
    result = extract_json_from_litellm_completion(
        {
            "choices": [
                {
                    "message": {
                        "content": (
                            "Here is the plan:\n```json\n"
                            + json.dumps(payload)
                            + "\n```\nThanks."
                        ),
                    },
                },
            ],
        },
    )
    assert result.ok is True
    assert result.parsed == payload


def test_parses_anthropic_text_blocks_splitting_json() -> None:
    body = {"candidates": []}
    raw = json.dumps(body)
    mid = len(raw) // 2
    result = extract_json_from_litellm_completion(
        {
            "choices": [
                {
                    "message": {
                        "content": [
                            {"type": "text", "text": raw[:mid]},
                            {"type": "text", "text": raw[mid:]},
                        ],
                    },
                },
            ],
        },
    )
    assert result.ok is True
    assert result.parsed == body


def test_reads_json_from_tool_call_when_content_null() -> None:
    payload = {"candidates": [{"field_key": "x"}]}
    result = extract_json_from_litellm_completion(
        {
            "choices": [
                {
                    "message": {
                        "content": None,
                        "tool_calls": [
                            {"function": {"arguments": json.dumps(payload)}},
                        ],
                    },
                },
            ],
        },
    )
    assert result.ok is True
    assert result.parsed == payload


def test_preserves_nested_arrays_inside_object() -> None:
    payload = {"candidates": [{"field_key": "a", "evidence": [{"page_number": 1}]}]}
    result = extract_json_from_litellm_completion(
        {"choices": [{"message": {"content": json.dumps(payload)}}]},
    )
    assert result.ok is True
    assert result.parsed == payload


def test_classifies_missing_content() -> None:
    result = extract_json_from_litellm_completion(
        {"choices": [{"message": {"content": None}}]},
    )
    assert result.ok is False
    assert result.reason == "missing_message_content"


def test_classifies_malformed_json() -> None:
    result = extract_json_from_litellm_completion(
        {"choices": [{"message": {"content": "not-json"}}]},
    )
    assert result.ok is False
    assert result.reason == "message_content_invalid_json"


def test_classifies_truncated_json() -> None:
    result = extract_json_from_litellm_completion(
        {"choices": [{"message": {"content": '{"candidates": ['}}]},
    )
    assert result.ok is False
    assert result.reason == "message_content_invalid_json"


def test_classifies_root_array() -> None:
    result = extract_json_from_litellm_completion(
        {"choices": [{"message": {"content": json.dumps([{"id": "q1"}])}}]},
    )
    assert result.ok is False
    assert result.reason == "message_content_not_object"


def test_classifies_ambiguous_multiple_objects() -> None:
    result = extract_json_from_litellm_completion(
        {
            "choices": [
                {
                    "message": {
                        "content": json.dumps({"a": 1}) + "\n" + json.dumps({"b": 2}),
                    },
                },
            ],
        },
    )
    assert result.ok is False
    assert result.reason == "message_content_ambiguous_json"


def test_measure_content_length_string_and_blocks() -> None:
    assert (
        measure_litellm_message_content_length(
            {"choices": [{"message": {"content": "abcdef"}}]},
        )
        == 6
    )
    assert (
        measure_litellm_message_content_length(
            {
                "choices": [
                    {
                        "message": {
                            "content": [
                                {"type": "text", "text": "ab"},
                                {"type": "text", "text": "cd"},
                            ],
                        },
                    },
                ],
            },
        )
        == 4
    )
