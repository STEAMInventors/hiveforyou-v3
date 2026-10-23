import type { DomainPackManifestV3 } from "@hiveforyou/contracts/domain-packs/v3";

import { PackValidationError } from "./pack-validation.js";

const OPERATOR_ALLOWLIST = new Set([
  "compare_measurements",
  "compare_commitment_observation",
  "detect_change",
  "find_disagreement",
  "trace_flow",
  "aggregate",
  "identify_gap",
]);

const ALLOWED_TOP_LEVEL = new Set([
  "contract_version",
  "contract_profile",
  "implementation_status",
  "pack_id",
  "pack_version",
  "review_status",
  "discovery",
  "concepts",
  "relationships",
  "investigations",
  "communication",
  "views_and_outcomes",
  "constructs",
  "vocabulary",
  "derivations",
  "regulatory_overlay",
  "historical_references",
  "enums",
  "jurisdictions",
  "loader_notice",
  "not_a_catalog_entry",
]);

/** Code-like markers only; plain-language phrases (e.g. "function of behavior") are allowed. */
const EXECUTABLE_MARKERS =
  /(\bfunction\s*\(|\=\>|=\>|`\s*[^`]*\$\{|\beval\s*\(|\bnew\s+Function\b|\bcallback\s*\()/i;

const MAX_MANIFEST_BYTES = 1_048_576;

function assertNoExecutableMarkers(value: unknown, path: string): void {
  if (typeof value === "string") {
    if (EXECUTABLE_MARKERS.test(value)) {
      throw new PackValidationError(`Executable marker in ${path}.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoExecutableMarkers(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      assertNoExecutableMarkers(nested, `${path}.${key}`);
    }
  }
}

function collectConceptIds(manifest: DomainPackManifestV3): Set<string> {
  const ids = new Set<string>();
  const concepts = manifest.concepts as { items?: { concept_id?: string }[] };
  for (const item of concepts.items ?? []) {
    if (item.concept_id?.trim()) {
      ids.add(item.concept_id.trim());
    }
  }
  return ids;
}

function collectDocumentTypeIds(manifest: DomainPackManifestV3): Set<string> {
  const ids = new Set<string>();
  const discovery = manifest.discovery as {
    document_types?: { document_type_id?: string }[];
  };
  for (const docType of discovery.document_types ?? []) {
    if (docType.document_type_id?.trim()) {
      ids.add(docType.document_type_id.trim());
    }
  }
  return ids;
}

function collectRelationshipTypeIds(manifest: DomainPackManifestV3): Set<string> {
  const ids = new Set<string>();
  const relationships = manifest.relationships as {
    types?: { relationship_type_id?: string }[];
  };
  for (const rel of relationships.types ?? []) {
    if (rel.relationship_type_id?.trim()) {
      ids.add(rel.relationship_type_id.trim());
    }
  }
  return ids;
}

export function validateDomainPackManifestV3(
  manifest: DomainPackManifestV3,
  options: { manifestBytes?: number; productionSelection?: boolean } = {},
): void {
  if (options.manifestBytes !== undefined && options.manifestBytes > MAX_MANIFEST_BYTES) {
    throw new PackValidationError("Manifest exceeds maximum size.");
  }

  for (const key of Object.keys(manifest as unknown as Record<string, unknown>)) {
    if (!ALLOWED_TOP_LEVEL.has(key)) {
      throw new PackValidationError(`Unknown top-level key: ${key}.`);
    }
  }

  if (options.productionSelection) {
    if (manifest.review_status !== "reviewed") {
      throw new PackValidationError("Pack is not reviewed.");
    }
    if (manifest.implementation_status?.includes("NOT_IMPLEMENTED")) {
      throw new PackValidationError("Pack implementation_status blocks production selection.");
    }
  }

  const investigationIds = new Set<string>();
  for (const item of manifest.investigations.items) {
    if (!item.investigation_id?.trim()) {
      throw new PackValidationError("Investigation missing investigation_id.");
    }
    if (investigationIds.has(item.investigation_id)) {
      throw new PackValidationError(`Duplicate investigation_id ${item.investigation_id}.`);
    }
    investigationIds.add(item.investigation_id);
    if (!OPERATOR_ALLOWLIST.has(item.operator_id)) {
      throw new PackValidationError(`Unsupported operator_id ${item.operator_id}.`);
    }
    if (item.operator_version !== "investigation-operator@1") {
      throw new PackValidationError("Investigation operator_version must be investigation-operator@1.");
    }
  }

  const allowlist = new Set(manifest.investigations.operator_allowlist ?? []);
  for (const op of OPERATOR_ALLOWLIST) {
    if (!allowlist.has(op)) {
      throw new PackValidationError("investigations.operator_allowlist is incomplete.");
    }
  }

  const conceptIds = collectConceptIds(manifest);
  const documentTypeIds = collectDocumentTypeIds(manifest);
  const relationshipIds = collectRelationshipTypeIds(manifest);

  const questionIds = new Set<string>();
  for (const question of manifest.views_and_outcomes.canonical_questions) {
    if (!question.question_id?.trim()) {
      throw new PackValidationError("Canonical question missing question_id.");
    }
    if (questionIds.has(question.question_id)) {
      throw new PackValidationError(`Duplicate question_id ${question.question_id}.`);
    }
    questionIds.add(question.question_id);
    for (const inv of question.investigation_ids ?? []) {
      if (!investigationIds.has(inv)) {
        throw new PackValidationError(
          `Question ${question.question_id} references unknown investigation ${inv}.`,
        );
      }
    }
    for (const concept of [...(question.required_concepts ?? []), ...(question.optional_concepts ?? [])]) {
      if (!conceptIds.has(concept)) {
        throw new PackValidationError(
          `Question ${question.question_id} references unknown concept ${concept}.`,
        );
      }
    }
    void documentTypeIds;
    void relationshipIds;
  }

  assertNoExecutableMarkers(manifest, "manifest");
}
