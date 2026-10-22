"""Fixture candidate extraction for pytest only (no model call)."""

import os

from hive_reader.models import CandidateEvidence, CandidateField


def fixture_extraction_enabled() -> bool:
    """Honor READER_EXTRACT_DETERMINISTIC only while pytest is executing a test.

    Production cannot select fixture extraction by setting the flag alone.
    """
    if os.environ.get("READER_EXTRACT_DETERMINISTIC", "").strip() != "1":
        return False
    return bool(os.environ.get("PYTEST_CURRENT_TEST", "").strip())


def extract_candidates_deterministic(
    *,
    pages: list[dict],
    schema_fields: list[dict],
) -> list[CandidateField]:
    if not pages:
        return [
            CandidateField(
                field_key=field["field_key"],
                value_json=None,
                status="unreadable",
                evidence=[],
                issues=["NO_PAGES"],
            )
            for field in schema_fields
        ]

    combined = "\n".join(page["text"] for page in pages)
    results: list[CandidateField] = []

    for field in schema_fields:
        key = field["field_key"]
        value = _lookup_fixture_value(key, combined)
        if value is None:
            results.append(
                CandidateField(
                    field_key=key,
                    value_json=None,
                    status="missing",
                    evidence=[],
                )
            )
            continue

        page_number = _find_page_for_snippet(pages, value)
        results.append(
            CandidateField(
                field_key=key,
                value_json={"raw": value},
                status="observed",
                evidence=[
                    CandidateEvidence(
                        page_number=page_number,
                        exact_quote=value,
                        quote_verified=True,
                    )
                ],
            )
        )

    return results


def _lookup_fixture_value(field_key: str, combined: str) -> str | None:
    markers = {
        "student_name": "Student: ",
        "iep_meeting_date": "IEP Meeting Date: ",
        "reporting_period_start": "Reporting Period Start: ",
        "merchant_name": "Store: ",
        "total": "Total: ",
    }
    marker = markers.get(field_key)
    if not marker or marker not in combined:
        return None
    start = combined.index(marker) + len(marker)
    end = combined.find("\n", start)
    if end == -1:
        end = len(combined)
    return combined[start:end].strip()


def _find_page_for_snippet(pages: list[dict], snippet: str) -> int:
    for page in pages:
        if snippet in page["text"]:
            return int(page["page_number"])
    return int(pages[0]["page_number"])
