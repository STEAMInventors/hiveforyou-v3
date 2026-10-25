import {
  PACK_EXTRACTION_INPUT_VERSION,
  type PackExtractionInputV1,
} from "@hiveforyou/contracts/pack-extraction/v1";
import { computeSha256Digest, serializePackJcs } from "@hiveforyou/core";

export type BuildPackExtractionUserMessageInput = {
  prompt_digest: string;
  source_ref_id: string;
  source_sha256: string;
  read_fingerprint: string;
  mime_family: string;
  page_count: number;
  window: {
    page_start: number;
    page_end: number;
    is_partial: boolean;
  };
  pages_meta: Array<{
    page_number: number;
    extraction_method: string;
    quality: string;
  }>;
  pages: Array<{
    page_number: number;
    text: string;
  }>;
};

export function buildPackExtractionUserMessage(
  input: BuildPackExtractionUserMessageInput,
): PackExtractionInputV1 {
  const pages = [...input.pages].sort((a, b) => a.page_number - b.page_number);
  const pages_meta = [...input.pages_meta].sort((a, b) => a.page_number - b.page_number);

  return {
    contract_version: PACK_EXTRACTION_INPUT_VERSION,
    prompt_digest: input.prompt_digest.startsWith("sha256:")
      ? input.prompt_digest
      : computeSha256Digest(input.prompt_digest),
    source_ref: {
      source_ref_id: input.source_ref_id,
      source_sha256: input.source_sha256,
      read_fingerprint: input.read_fingerprint,
    },
    source_metadata: {
      mime_family: input.mime_family,
      page_count: input.page_count,
      window: input.window,
      pages: pages_meta,
    },
    pages,
  };
}

export function serializePackExtractionUserMessage(input: PackExtractionInputV1): string {
  return serializePackJcs(input);
}
