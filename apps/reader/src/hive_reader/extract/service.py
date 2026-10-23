import hashlib
import json
from typing import Any

from hive_reader import __version__
from hive_reader.config import settings
from hive_reader.extract.deterministic import (
    extract_candidates_deterministic,
    fixture_extraction_enabled,
)
from hive_reader.extract.litellm_reasoning import extract_via_litellm
from hive_reader.extract.validate import split_reusable_facts, validate_candidate_evidence
from hive_reader.models import (
    CandidateEvidence,
    CandidateField,
    ReaderCandidateExtraction,
    ReaderExtractCandidatesRequest,
    ReaderExtractCandidatesResponse,
    ReaderModelCallProvenance,
    ReaderReadDocumentProvenance,
)
from hive_reader.pipeline.router import ExtractionError


def _compute_extract_fingerprint(
    read_fingerprint: str,
    schema_hash: str,
    contract_version: str = "reader-extract-candidates@1",
) -> str:
    payload = {
        "contract_version": contract_version,
        "read_fingerprint": read_fingerprint,
        "schema_hash": schema_hash,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _parse_model_candidates(
    raw: dict[str, Any],
    schema_fields: list[dict[str, Any]],
    page_count: int,
) -> list[CandidateField]:
    by_key = {field["field_key"]: field for field in schema_fields}
    raw_candidates = raw.get("candidates")
    if not isinstance(raw_candidates, list):
        raise ExtractionError("MODEL_OUTPUT_INVALID", "Model output missing candidates array.")

    parsed: list[CandidateField] = []
    seen: set[str] = set()
    for entry in raw_candidates:
        if not isinstance(entry, dict):
            continue
        field_key = str(entry.get("field_key", "")).strip()
        if not field_key or field_key not in by_key:
            continue
        seen.add(field_key)
        status = str(entry.get("status", "unknown"))
        if status not in {"observed", "missing", "unknown", "unreadable"}:
            status = "unknown"
        value_json = entry.get("value_json")
        if status == "observed" and not isinstance(value_json, dict):
            value_json = {"raw": entry.get("value")}

        evidence_raw = entry.get("evidence") if isinstance(entry.get("evidence"), list) else []
        evidence = [
            CandidateEvidence(
                page_number=int(item.get("page_number", 1)),
                exact_quote=str(item.get("exact_quote", "")),
                quote_verified=False,
            )
            for item in evidence_raw
            if isinstance(item, dict)
        ]
        evidence, issues = validate_candidate_evidence(page_count, evidence)
        parsed.append(
            CandidateField(
                field_key=field_key,
                value_json=value_json if isinstance(value_json, dict) else None,
                status=status,  # type: ignore[arg-type]
                evidence=evidence,
                issues=issues or None,
            )
        )

    for field in schema_fields:
        key = field["field_key"]
        if key not in seen:
            parsed.append(
                CandidateField(
                    field_key=key,
                    value_json=None,
                    status="missing",
                    evidence=[],
                )
            )

    parsed.sort(key=lambda item: item.field_key)
    return parsed


def _field_coverage(candidates: list[CandidateField]) -> dict[str, int]:
    counts = {"populated": 0, "missing": 0, "unknown": 0, "unreadable": 0}
    for candidate in candidates:
        if candidate.status == "observed":
            counts["populated"] += 1
        elif candidate.status in counts:
            counts[candidate.status] += 1
    return counts


async def extract_candidates(
    request: ReaderExtractCandidatesRequest,
) -> ReaderExtractCandidatesResponse:
    if request.contract_version != "reader-extract-candidates@1":
        raise ExtractionError("INVALID_REQUEST", "Unsupported contract version.")

    if not request.pages:
        raise ExtractionError("INVALID_REQUEST", "At least one page is required.")

    schema = request.extraction_schema
    schema_fields = [field.model_dump() for field in schema.fields]
    page_payload = [page.model_dump() for page in request.pages]
    page_count = len(request.pages)

    use_deterministic = fixture_extraction_enabled()
    model_calls: list[ReaderModelCallProvenance] = []

    if use_deterministic:
        candidates = extract_candidates_deterministic(
            pages=page_payload,
            schema_fields=schema_fields,
        )
    else:
        guidance_payload = (
            [item.model_dump() for item in schema.field_guidance]
            if schema.field_guidance
            else None
        )
        parsed, provenance, error_code = extract_via_litellm(
            pages=page_payload,
            schema_fields=schema_fields,
            intent_text=schema.intent_text,
            field_guidance=guidance_payload,
        )
        if error_code == "P2_REASONING_NOT_CONFIGURED":
            raise ExtractionError(
                "DEPENDENCY_UNAVAILABLE",
                "P2 reasoning alias is not configured.",
            )
        if error_code in {"MODEL_UNAVAILABLE", "MODEL_TIMEOUT"}:
            raise ExtractionError(error_code, "Model call failed.")
        if error_code or parsed is None:
            raise ExtractionError("MODEL_OUTPUT_INVALID", "Model returned invalid extraction JSON.")
        candidates = _parse_model_candidates(parsed, schema_fields, page_count)
        if provenance:
            model_calls.append(ReaderModelCallProvenance(**provenance))

    for index, candidate in enumerate(candidates):
        evidence, issues = validate_candidate_evidence(page_count, candidate.evidence)
        merged_issues = list(candidate.issues or [])
        merged_issues.extend(issues)
        candidates[index] = candidate.model_copy(
            update={"evidence": evidence, "issues": merged_issues or None},
        )

    reusable_keys = {
        field.field_key for field in schema.fields if field.reusable
    }
    candidates, reusable_source_facts = split_reusable_facts(candidates, reusable_keys)

    extraction = ReaderCandidateExtraction(
        contract_version="reader-candidate-extraction@1",
        extraction_schema_id=schema.extraction_schema_id,
        schema_hash=schema.schema_hash,
        candidates=candidates,
        reusable_source_facts=reusable_source_facts,
        field_coverage=_field_coverage(candidates),
        extract_fingerprint=_compute_extract_fingerprint(
            request.read_fingerprint,
            schema.schema_hash,
        ),
    )

    provenance = ReaderReadDocumentProvenance(
        reader_git_sha=settings.git_sha,
        reader_version=__version__,
        tools={"extract_mode": "deterministic" if use_deterministic else "litellm"},
        model_calls=model_calls,
    )

    return ReaderExtractCandidatesResponse(
        contract_version="reader-extract-candidates@1",
        status="SUCCEEDED",
        source=request.source,
        read_fingerprint=request.read_fingerprint,
        extraction=extraction,
        provenance=provenance,
    )
