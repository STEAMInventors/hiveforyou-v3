from typing import Literal

from pydantic import BaseModel, Field

READER_DOCUMENT_READ_VERSION = "reader-document-read@1"
HIVE_SOURCE_DOCUMENTS_BUCKET = "hive3-source-documents"


class ReaderReadDocumentSource(BaseModel):
    source_document_id: str
    hive_id: str
    owner_user_id: str
    storage_bucket: Literal["hive3-source-documents"]
    storage_path: str
    mime_type: str
    byte_size: int = Field(gt=0)
    sha256: str
    filename: str


class ReaderReadDocumentOptions(BaseModel):
    max_pages: int | None = None
    ocr_mode: Literal["selective", "never", "always"] = "selective"
    docx_page_break_strategy: Literal["reproducible_v1"] = "reproducible_v1"


class ReaderReadDocumentRequest(BaseModel):
    contract_version: Literal["reader-document-read@1"]
    source: ReaderReadDocumentSource
    options: ReaderReadDocumentOptions | None = None
    extraction_schema: dict | None = None


class ReaderPageQuality(BaseModel):
    character_count: int
    identity_text_sufficient: bool
    issues: list[str]


class ReaderReadDocumentPage(BaseModel):
    page_number: int
    text: str
    extraction_method: Literal[
        "pdf_native", "image_ocr_local", "image_ocr_litellm", "docx_render_v1"
    ]
    quality: ReaderPageQuality


class ReaderModelCallProvenance(BaseModel):
    litellm_alias: str
    provider: str
    model_id: str
    page_numbers: list[int]
    latency_ms: float


class ReaderReadDocumentProvenance(BaseModel):
    reader_git_sha: str
    reader_version: str
    tools: dict[str, str]
    model_calls: list[ReaderModelCallProvenance]


class ReaderReadDocumentResponse(BaseModel):
    contract_version: Literal["reader-document-read@1"]
    status: Literal["SUCCEEDED", "FAILED"]
    source: ReaderReadDocumentSource
    source_hash_verified: bool
    page_count: int
    pages: list[ReaderReadDocumentPage]
    provenance: ReaderReadDocumentProvenance
    read_fingerprint: str


class ErrorEnvelopeV1(BaseModel):
    contract_version: Literal["error-envelope@1"]
    error_code: str
    category: str
    retryable: bool
    message_safe: str
    correlation_id: str
    study_run_id: str | None = None
    stage: str | None = None


class ExtractionSchemaField(BaseModel):
    field_key: str
    title: str
    description: str | None = None
    value_type: str
    required: bool | None = None
    reusable: bool | None = None
    evidence_required: bool | None = None
    required_for_intent: bool | None = None


class ExtractionFieldGuidance(BaseModel):
    record_type_id: str
    repeatable: bool
    nested_field_ids: list[str]
    reading_note: str | None = None
    identity_key_fields: list[str] | None = None


class ExtractionSchemaProvenance(BaseModel):
    match_tier: Literal["exact", "partial", "generic"]
    pack_id: str | None = None
    pack_version: str | None = None
    pack_digest: str | None = None
    document_type_id: str | None = None
    domain_id: str | None = None


class ExtractionSchema(BaseModel):
    contract_version: Literal["extraction-schema@1"]
    extraction_schema_id: str
    schema_hash: str
    intent_text: str
    fields: list[ExtractionSchemaField]
    provenance: ExtractionSchemaProvenance
    generic: bool
    field_guidance: list[ExtractionFieldGuidance] | None = None


class CandidateEvidence(BaseModel):
    page_number: int
    exact_quote: str
    quote_verified: bool = False


class CandidateField(BaseModel):
    field_key: str
    value_json: dict | None = None
    status: Literal["observed", "missing", "unknown", "unreadable"]
    evidence: list[CandidateEvidence] = Field(default_factory=list)
    issues: list[str] | None = None


class ReusableSourceFact(BaseModel):
    fact_key: str
    kind: Literal["observed", "classification"]
    value_json: dict
    evidence: list[CandidateEvidence] = Field(default_factory=list)


class ReaderCandidateExtraction(BaseModel):
    contract_version: Literal["reader-candidate-extraction@1"]
    extraction_schema_id: str
    schema_hash: str
    candidates: list[CandidateField]
    reusable_source_facts: list[ReusableSourceFact]
    field_coverage: dict[str, int]
    extract_fingerprint: str


class ReaderExtractCandidatesRequest(BaseModel):
    contract_version: Literal["reader-extract-candidates@1"]
    source: ReaderReadDocumentSource
    pages: list[ReaderReadDocumentPage]
    read_fingerprint: str
    extraction_schema: ExtractionSchema


class ReaderExtractCandidatesResponse(BaseModel):
    contract_version: Literal["reader-extract-candidates@1"]
    status: Literal["SUCCEEDED", "FAILED"]
    source: ReaderReadDocumentSource
    read_fingerprint: str
    extraction: ReaderCandidateExtraction
    provenance: ReaderReadDocumentProvenance
