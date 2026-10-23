import {
  DOMAIN_PACK_CONTRACT_PROFILE_FIVE_SECTION,
  DOMAIN_PACK_MANIFEST_V3,
  type DomainPackManifestV3,
} from "./types.js";

export type DomainPackV3ParseResult =
  | { ok: true; value: DomainPackManifestV3 }
  | { ok: false; message: string; field?: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseDomainPackManifestV3(raw: unknown): DomainPackV3ParseResult {
  if (!isObject(raw)) {
    return { ok: false, message: "Pack manifest must be a JSON object." };
  }
  if (raw.contract_version !== DOMAIN_PACK_MANIFEST_V3) {
    return { ok: false, message: "Unsupported contract_version.", field: "contract_version" };
  }
  if (raw.contract_profile !== DOMAIN_PACK_CONTRACT_PROFILE_FIVE_SECTION) {
    return { ok: false, message: "Invalid contract_profile.", field: "contract_profile" };
  }
  if (typeof raw.pack_id !== "string" || !raw.pack_id.trim()) {
    return { ok: false, message: "pack_id is required.", field: "pack_id" };
  }
  if (typeof raw.pack_version !== "string" || !raw.pack_version.trim()) {
    return { ok: false, message: "pack_version is required.", field: "pack_version" };
  }
  for (const key of [
    "discovery",
    "concepts",
    "relationships",
    "investigations",
    "communication",
    "views_and_outcomes",
  ] as const) {
    if (!isObject(raw[key])) {
      return { ok: false, message: `Missing required section ${key}.`, field: key };
    }
  }
  const views = raw.views_and_outcomes as Record<string, unknown>;
  if (!Array.isArray(views.canonical_questions)) {
    return {
      ok: false,
      message: "views_and_outcomes.canonical_questions must be an array.",
      field: "views_and_outcomes.canonical_questions",
    };
  }
  const investigations = raw.investigations as Record<string, unknown>;
  if (!Array.isArray(investigations.items)) {
    return {
      ok: false,
      message: "investigations.items must be an array.",
      field: "investigations.items",
    };
  }
  return { ok: true, value: raw as DomainPackManifestV3 };
}
