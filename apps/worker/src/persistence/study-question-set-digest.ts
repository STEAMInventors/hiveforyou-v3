import {
  parseStudyQuestionSetV1,
  type StudyQuestionSetV1,
} from "@hiveforyou/contracts/study-runs/v1";

import { sha256JsonPayload } from "./artifact-json-hash.js";

/** Placeholder digest; excluded from the semantic content_hash payload. */
const CONTENT_HASH_PLACEHOLDER = "0".repeat(64);

/**
 * Contract-normalized question-set body used for `content_hash` (excludes `content_hash`).
 * Matches `parseStudyQuestionSetV1` output shape so persistence validation agrees with producers.
 */
export function normalizeStudyQuestionSetForContentHash(
  payload: Omit<StudyQuestionSetV1, "content_hash">,
): Omit<StudyQuestionSetV1, "content_hash"> {
  const parsed = parseStudyQuestionSetV1({
    ...payload,
    content_hash: CONTENT_HASH_PLACEHOLDER,
  });
  if (!parsed.ok) {
    throw new Error(`Cannot normalize question set for content hash: ${parsed.message}`);
  }
  const { content_hash: _ignored, ...rest } = parsed.value;
  return rest;
}

/** Semantic digest for `study-question-set@1` (`content_hash`; excludes the hash field itself). */
export function computeStudyQuestionSetContentHash(
  payload: Omit<StudyQuestionSetV1, "content_hash">,
): string {
  const normalized = normalizeStudyQuestionSetForContentHash(payload);
  return sha256JsonPayload(normalized);
}

export function studyQuestionSetSemanticDigest(payload: StudyQuestionSetV1): string {
  const { content_hash: _ignored, ...rest } = payload;
  return sha256JsonPayload(rest);
}

/** Normalize per contract and attach a matching `content_hash`. */
export function finalizeStudyQuestionSet(
  payload: Omit<StudyQuestionSetV1, "content_hash">,
): StudyQuestionSetV1 {
  const digestPayload = normalizeStudyQuestionSetForContentHash(payload);
  const content_hash = sha256JsonPayload(digestPayload);
  return { ...digestPayload, content_hash };
}
