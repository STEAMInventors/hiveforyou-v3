import { computeSha256Digest } from "./pack-digest.js";

export const PACK_EXTRACTION_CANDIDATE_KEY_VERSION = "pack-extraction-candidate@1" as const;

export type PackCandidateKeyInputV1 = {
  record_type_id: string;
  record_local_id: string;
  parent_record_local_id: string | null;
  segment_index: number;
  fact_id: string;
};

/** Stable idempotency key for one accepted Pack extraction candidate within a batch. */
export function computePackCandidateKey(input: PackCandidateKeyInputV1): string {
  const parent = input.parent_record_local_id ?? "";
  const canonical =
    `${PACK_EXTRACTION_CANDIDATE_KEY_VERSION}\n` +
    `${input.record_type_id}\n` +
    `${input.record_local_id}\n` +
    `${parent}\n` +
    `${input.segment_index}\n` +
    `${input.fact_id}\n`;
  return computeSha256Digest(canonical);
}
