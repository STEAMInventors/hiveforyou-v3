import {
  containsForbiddenKeys,
  isNonEmptyString,
  isRecord,
  isSha256Digest,
  isSha256Hex,
  normalizeSha256Digest,
  normalizeSha256Hex,
  PACK_EXTRACTION_REF_FORBIDDEN_KEYS,
  type PackExtractionParseResult,
} from "./common.js";
import { PACK_EXTRACTION_REF_VERSION, type PackExtractionRefV1 } from "./types.js";

export function parsePackExtractionRefV1(value: unknown): PackExtractionParseResult<PackExtractionRefV1> {
  if (!isRecord(value)) {
    return { ok: false, message: "Ref payload must be a JSON object." };
  }
  if (value.contract_version !== PACK_EXTRACTION_REF_VERSION) {
    return {
      ok: false,
      message: "Invalid contract_version for pack-extraction-ref@1.",
      field: "contract_version",
    };
  }
  const forbidden = containsForbiddenKeys(value, PACK_EXTRACTION_REF_FORBIDDEN_KEYS);
  if (forbidden) {
    return {
      ok: false,
      message: "Ref artifact must contain digests and versions only (no prompt or document content).",
      field: forbidden,
    };
  }
  if (!isNonEmptyString(value.pack_id, 128)) {
    return { ok: false, message: "pack_id is required.", field: "pack_id" };
  }
  if (!isNonEmptyString(value.pack_version, 64)) {
    return { ok: false, message: "pack_version is required.", field: "pack_version" };
  }
  if (!isSha256Hex(value.pack_digest)) {
    return { ok: false, message: "pack_digest must be a SHA-256 hex digest.", field: "pack_digest" };
  }
  if (!isNonEmptyString(value.prompt_template_version, 64)) {
    return {
      ok: false,
      message: "prompt_template_version is required.",
      field: "prompt_template_version",
    };
  }
  if (!isNonEmptyString(value.extraction_rules_version, 64)) {
    return {
      ok: false,
      message: "extraction_rules_version is required.",
      field: "extraction_rules_version",
    };
  }
  if (!isNonEmptyString(value.output_contract_version, 64)) {
    return {
      ok: false,
      message: "output_contract_version is required.",
      field: "output_contract_version",
    };
  }
  if (!Array.isArray(value.prompt_digests) || value.prompt_digests.length === 0) {
    return { ok: false, message: "prompt_digests must be a non-empty array.", field: "prompt_digests" };
  }
  const prompt_digests: string[] = [];
  for (let i = 0; i < value.prompt_digests.length; i += 1) {
    const digest = value.prompt_digests[i];
    if (!isSha256Digest(digest)) {
      return {
        ok: false,
        message: "Each prompt_digest must be sha256:<64 hex>.",
        field: `prompt_digests[${i}]`,
      };
    }
    prompt_digests.push(normalizeSha256Digest(digest));
  }
  const ref: PackExtractionRefV1 = {
    contract_version: PACK_EXTRACTION_REF_VERSION,
    pack_id: value.pack_id.trim(),
    pack_version: value.pack_version.trim(),
    pack_digest: normalizeSha256Hex(value.pack_digest),
    prompt_template_version: value.prompt_template_version.trim(),
    extraction_rules_version: value.extraction_rules_version.trim(),
    output_contract_version: value.output_contract_version.trim(),
    prompt_digests,
  };
  if (value.pack_canonical_digest !== undefined) {
    if (!isSha256Digest(value.pack_canonical_digest)) {
      return {
        ok: false,
        message: "pack_canonical_digest must be sha256:<64 hex>.",
        field: "pack_canonical_digest",
      };
    }
    ref.pack_canonical_digest = normalizeSha256Digest(value.pack_canonical_digest);
  }
  if (value.catalog_digest !== undefined) {
    if (!isSha256Digest(value.catalog_digest)) {
      return {
        ok: false,
        message: "catalog_digest must be sha256:<64 hex>.",
        field: "catalog_digest",
      };
    }
    ref.catalog_digest = normalizeSha256Digest(value.catalog_digest);
  }
  if (value.output_schema_digest !== undefined) {
    if (!isSha256Digest(value.output_schema_digest)) {
      return {
        ok: false,
        message: "output_schema_digest must be sha256:<64 hex>.",
        field: "output_schema_digest",
      };
    }
    ref.output_schema_digest = normalizeSha256Digest(value.output_schema_digest);
  }
  if (value.partition_plan_digest !== undefined) {
    if (value.partition_plan_digest === null) {
      ref.partition_plan_digest = null;
    } else if (isSha256Digest(value.partition_plan_digest)) {
      ref.partition_plan_digest = normalizeSha256Digest(value.partition_plan_digest);
    } else {
      return {
        ok: false,
        message: "partition_plan_digest must be null or sha256:<64 hex>.",
        field: "partition_plan_digest",
      };
    }
  }
  return { ok: true, value: ref };
}
