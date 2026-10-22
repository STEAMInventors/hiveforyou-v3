import { ALLOWED_UPLOAD_MIME_TYPES } from "../../documents/v1/types.js";

/** Internal Worker → Reader contract for universal page-grounded document read (P2.1). */
export const READER_DOCUMENT_READ_VERSION = "reader-document-read@1" as const;

export const HIVE_SOURCE_DOCUMENTS_BUCKET = "hive3-source-documents" as const;

export const READER_HTTP_HEADERS = {
  CORRELATION_ID: "x-correlation-id",
  STUDY_RUN_ID: "x-study-run-id",
  EXTRACTION_BATCH_ID: "x-extraction-batch-id",
} as const;

export type ReaderAllowedMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

export type ReaderOcrModeV1 = "selective" | "never" | "always";

export type ReaderDocxPageBreakStrategyV1 = "reproducible_v1";

export type ReaderReadDocumentSourceV1 = {
  source_document_id: string;
  hive_id: string;
  owner_user_id: string;
  storage_bucket: typeof HIVE_SOURCE_DOCUMENTS_BUCKET;
  storage_path: string;
  mime_type: ReaderAllowedMimeType | string;
  byte_size: number;
  sha256: string;
  filename: string;
};

export type ReaderReadDocumentOptionsV1 = {
  max_pages?: number;
  ocr_mode?: ReaderOcrModeV1;
  docx_page_break_strategy?: ReaderDocxPageBreakStrategyV1;
};

/** P2.2: intent-driven schema extraction uses this slot; null in P2.1. */
export type ReaderExtractionSchemaSlotV1 = null | {
  extraction_schema_id?: string;
  schema_json?: Record<string, unknown>;
};

export type ReaderReadDocumentRequestV1 = {
  contract_version: typeof READER_DOCUMENT_READ_VERSION;
  source: ReaderReadDocumentSourceV1;
  options?: ReaderReadDocumentOptionsV1;
  extraction_schema?: ReaderExtractionSchemaSlotV1;
};

export type PageExtractionMethodV1 =
  | "pdf_native"
  | "image_ocr_local"
  | "image_ocr_litellm"
  | "docx_render_v1";

export type ReaderPageQualityV1 = {
  character_count: number;
  identity_text_sufficient: boolean;
  issues: string[];
};

export type ReaderReadDocumentPageV1 = {
  page_number: number;
  text: string;
  extraction_method: PageExtractionMethodV1;
  quality: ReaderPageQualityV1;
};

export type ReaderModelCallProvenanceV1 = {
  litellm_alias: string;
  provider: string;
  model_id: string;
  page_numbers: number[];
  latency_ms: number;
};

export type ReaderReadDocumentProvenanceV1 = {
  reader_git_sha: string;
  reader_version: string;
  tools: Record<string, string>;
  model_calls: ReaderModelCallProvenanceV1[];
};

export type ReaderReadDocumentResponseV1 = {
  contract_version: typeof READER_DOCUMENT_READ_VERSION;
  status: "SUCCEEDED" | "FAILED";
  source: ReaderReadDocumentSourceV1;
  source_hash_verified: boolean;
  page_count: number;
  pages: ReaderReadDocumentPageV1[];
  provenance: ReaderReadDocumentProvenanceV1;
  read_fingerprint: string;
};
