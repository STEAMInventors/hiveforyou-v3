import type {
  ExtractionSchemaV1,
  ReaderCandidateExtractionV1,
} from "../../extraction/v1/types.js";
import type {
  ReaderReadDocumentPageV1,
  ReaderReadDocumentProvenanceV1,
  ReaderReadDocumentSourceV1,
} from "./types.js";

export const READER_EXTRACT_CANDIDATES_VERSION =
  "reader-extract-candidates@1" as const;

export type ReaderExtractCandidatesRequestV1 = {
  contract_version: typeof READER_EXTRACT_CANDIDATES_VERSION;
  source: ReaderReadDocumentSourceV1;
  pages: ReaderReadDocumentPageV1[];
  read_fingerprint: string;
  extraction_schema: ExtractionSchemaV1;
};

export type ReaderExtractCandidatesResponseV1 = {
  contract_version: typeof READER_EXTRACT_CANDIDATES_VERSION;
  status: "SUCCEEDED" | "FAILED";
  source: ReaderReadDocumentSourceV1;
  read_fingerprint: string;
  extraction: ReaderCandidateExtractionV1;
  provenance: ReaderReadDocumentProvenanceV1;
};
