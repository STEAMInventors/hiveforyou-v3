from hive_reader.models import (
    CandidateEvidence,
    CandidateField,
    ReusableSourceFact,
)


def validate_candidate_evidence(
    page_count: int,
    evidence: list[CandidateEvidence],
) -> tuple[list[CandidateEvidence], list[str]]:
    issues: list[str] = []
    validated: list[CandidateEvidence] = []
    for anchor in evidence:
        if anchor.page_number < 1 or anchor.page_number > page_count:
            issues.append("UNSUPPORTED_PAGE_REFERENCE")
            validated.append(
                anchor.model_copy(
                    update={"quote_verified": False},
                )
            )
            continue
        if not anchor.exact_quote.strip():
            issues.append("MISSING_QUOTE")
            validated.append(anchor.model_copy(update={"quote_verified": False}))
            continue
        validated.append(anchor)
    return validated, issues


def split_reusable_facts(
    candidates: list[CandidateField],
    reusable_field_keys: set[str],
) -> tuple[list[CandidateField], list[ReusableSourceFact]]:
    reusable: list[ReusableSourceFact] = []
    remaining: list[CandidateField] = []
    for candidate in candidates:
        if candidate.field_key in reusable_field_keys and candidate.status == "observed":
            reusable.append(
                ReusableSourceFact(
                    fact_key=candidate.field_key,
                    kind="observed",
                    value_json=candidate.value_json or {},
                    evidence=candidate.evidence,
                )
            )
        remaining.append(candidate)
    return remaining, reusable
