import type { DomainPackRecordIdentityV2 } from "@hiveforyou/contracts/domain-packs/v2";
import { PACK_EXTRACTION_OUTPUT_JSON_SCHEMA } from "@hiveforyou/contracts/pack-extraction/v1";

import { buildCanonicalPackManifest } from "./pack-canonical-manifest.js";
import { computeJcsSha256Digest } from "./pack-digest.js";
import type { NormalizedDomainPackManifest } from "./pack-normalize.js";
import { validatePackRelationships } from "./pack-relationships.js";
import { computePackDigest } from "./schema-hash.js";

export type PackFactCatalogIssue = {
  code:
    | "MISSING_RECORD_TYPES"
    | "DUPLICATE_RECORD_TYPE_ID"
    | "DUPLICATE_FIELD_ID"
    | "DUPLICATE_FACT_ID"
    | "INVALID_IDENTITY_REFERENCE"
    | "RELATIONSHIP_INVALID"
    | "INCOMPLETE_CATALOG";
  message: string;
  record_type_id?: string;
  field_id?: string;
  fact_id?: string;
};

export class PackFactCatalogError extends Error {
  constructor(
    message: string,
    readonly issues: PackFactCatalogIssue[],
  ) {
    super(message);
    this.name = "PackFactCatalogError";
  }
}

export type PackCatalogFactDefinition = {
  fact_id: string;
  field_id: string;
  value_kind: string;
  description?: string;
  sensitive?: boolean;
  enum?: string[];
  construct_ref?: string;
};

export type PackCatalogRecordType = {
  record_type_id: string;
  label: string;
  group?: string;
  repeatable: boolean;
  description?: string;
  identity: DomainPackRecordIdentityV2;
  facts: PackCatalogFactDefinition[];
};

export type PackFactCatalogBody = {
  pack_id: string;
  pack_version: string;
  record_types: PackCatalogRecordType[];
};

export type PackFactCatalogDigests = {
  pack_digest: string;
  pack_canonical_digest: string;
  /** JCS digest of sorted fact IDs (pins completeness; independent of descriptions/enums). */
  catalog_digest: string;
  /** JCS digest of the compiled catalog body (fact definitions + record identity metadata). */
  catalog_body_digest: string;
  output_schema_digest: string;
};

export type PackFactCatalogResult = PackFactCatalogDigests & {
  pack_id: string;
  pack_version: string;
  catalog_fact_count: number;
  fact_ids: string[];
  catalog: PackFactCatalogBody;
};

export type BuildPackFactCatalogOptions = {
  /** Raw manifest UTF-8 bytes for `pack_digest`; when omitted, canonical digest only. */
  manifestBytes?: string;
};

function fieldIdsForRecord(manifest: NormalizedDomainPackManifest, recordTypeId: string): Set<string> {
  const record = manifest.record_types?.find((entry) => entry.record_type_id === recordTypeId);
  return new Set(record?.fields.map((field) => field.field_id) ?? []);
}

function validateIdentityFieldRefs(
  manifest: NormalizedDomainPackManifest,
  issues: PackFactCatalogIssue[],
): void {
  for (const record of manifest.record_types ?? []) {
    const declared = fieldIdsForRecord(manifest, record.record_type_id);
    const refs: { label: string; values: string[] }[] = [
      { label: "key_fields", values: record.identity.key_fields },
      { label: "key_fields_if_present", values: record.identity.key_fields_if_present ?? [] },
      { label: "disambiguators", values: record.identity.disambiguators ?? [] },
    ];
    for (const ref of refs) {
      for (const fieldId of ref.values) {
        if (!declared.has(fieldId)) {
          issues.push({
            code: "INVALID_IDENTITY_REFERENCE",
            record_type_id: record.record_type_id,
            field_id: fieldId,
            message: `Record ${record.record_type_id} identity ${ref.label} references undeclared field ${fieldId}.`,
          });
        }
      }
    }
  }
}

function validateCatalogStructure(manifest: NormalizedDomainPackManifest): PackFactCatalogIssue[] {
  const issues: PackFactCatalogIssue[] = [];

  if (!manifest.record_types?.length) {
    issues.push({
      code: "MISSING_RECORD_TYPES",
      message: "Fact catalog requires record_types on the pack manifest.",
    });
    return issues;
  }

  issues.push(...validatePackRelationships(manifest).map((entry) => ({
    code: "RELATIONSHIP_INVALID" as const,
    message: entry.message,
  })));

  const recordIds = new Set<string>();
  const factIds = new Set<string>();

  for (const record of manifest.record_types) {
    if (recordIds.has(record.record_type_id)) {
      issues.push({
        code: "DUPLICATE_RECORD_TYPE_ID",
        record_type_id: record.record_type_id,
        message: `Duplicate record_type_id ${record.record_type_id}.`,
      });
    }
    recordIds.add(record.record_type_id);

    const fieldIds = new Set<string>();
    for (const field of record.fields) {
      if (fieldIds.has(field.field_id)) {
        issues.push({
          code: "DUPLICATE_FIELD_ID",
          record_type_id: record.record_type_id,
          field_id: field.field_id,
          message: `Duplicate field_id ${field.field_id} on record ${record.record_type_id}.`,
        });
      }
      fieldIds.add(field.field_id);

      const factId = `${record.record_type_id}.${field.field_id}`;
      if (factIds.has(factId)) {
        issues.push({
          code: "DUPLICATE_FACT_ID",
          record_type_id: record.record_type_id,
          field_id: field.field_id,
          fact_id: factId,
          message: `Duplicate fact_id ${factId}.`,
        });
      }
      factIds.add(factId);
    }
  }

  validateIdentityFieldRefs(manifest, issues);
  return issues;
}

function constructRefForField(
  manifest: NormalizedDomainPackManifest,
  fieldId: string,
): string | undefined {
  const constructs = manifest.constructs;
  if (!constructs || typeof constructs !== "object") {
    return undefined;
  }
  const prefix = fieldId.split(".")[0];
  if (prefix && Object.prototype.hasOwnProperty.call(constructs, prefix)) {
    return prefix;
  }
  return undefined;
}

function buildCatalogBody(manifest: NormalizedDomainPackManifest): PackFactCatalogBody {
  const record_types = [...(manifest.record_types ?? [])]
    .sort((a, b) =>
      a.record_type_id.localeCompare(b.record_type_id, undefined, { numeric: true }),
    )
    .map((record) => {
      const facts = [...record.fields]
        .sort((a, b) => a.field_id.localeCompare(b.field_id, undefined, { numeric: true }))
        .map((field) => {
          const fact: PackCatalogFactDefinition = {
            fact_id: `${record.record_type_id}.${field.field_id}`,
            field_id: field.field_id,
            value_kind: field.value_kind,
          };
          if (field.description !== undefined) {
            fact.description = field.description;
          }
          if (field.sensitive !== undefined) {
            fact.sensitive = field.sensitive;
          }
          if (field.enum !== undefined) {
            fact.enum = [...field.enum];
          }
          const constructRef = constructRefForField(manifest, field.field_id);
          if (constructRef) {
            fact.construct_ref = constructRef;
          }
          return fact;
        });

      return {
        record_type_id: record.record_type_id,
        label: record.label,
        group: record.group,
        repeatable: record.repeatable,
        description: record.description,
        identity: record.identity,
        facts,
      };
    });

  return {
    pack_id: manifest.pack_id,
    pack_version: manifest.pack_version,
    record_types,
  };
}

function assertCatalogComplete(
  manifest: NormalizedDomainPackManifest,
  catalog: PackFactCatalogBody,
): void {
  const expected = new Set<string>();
  for (const record of manifest.record_types ?? []) {
    for (const field of record.fields) {
      expected.add(`${record.record_type_id}.${field.field_id}`);
    }
  }
  const actual = new Set<string>();
  for (const record of catalog.record_types) {
    for (const fact of record.facts) {
      actual.add(fact.fact_id);
    }
  }
  if (expected.size !== actual.size) {
    throw new PackFactCatalogError("Fact catalog is incomplete.", [
      {
        code: "INCOMPLETE_CATALOG",
        message: `Expected ${expected.size} facts but catalog contains ${actual.size}.`,
      },
    ]);
  }
  for (const factId of expected) {
    if (!actual.has(factId)) {
      throw new PackFactCatalogError("Fact catalog is incomplete.", [
        {
          code: "INCOMPLETE_CATALOG",
          fact_id: factId,
          message: `Missing fact_id ${factId} from compiled catalog.`,
        },
      ]);
    }
  }
}

export function validatePackFactCatalog(manifest: NormalizedDomainPackManifest): PackFactCatalogIssue[] {
  return validateCatalogStructure(manifest);
}

export function assertValidPackFactCatalog(manifest: NormalizedDomainPackManifest): void {
  const issues = validatePackFactCatalog(manifest);
  if (issues.length > 0) {
    throw new PackFactCatalogError(issues[0]!.message, issues);
  }
}

export function computeCatalogDigest(factIds: string[]): string {
  const sorted = [...factIds].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return computeJcsSha256Digest(sorted);
}

export function computeOutputSchemaDigest(): string {
  return computeJcsSha256Digest(PACK_EXTRACTION_OUTPUT_JSON_SCHEMA);
}

export function buildPackFactCatalog(
  manifest: NormalizedDomainPackManifest,
  options: BuildPackFactCatalogOptions = {},
): PackFactCatalogResult {
  const issues = validatePackFactCatalog(manifest);
  if (issues.length > 0) {
    throw new PackFactCatalogError(issues[0]!.message, issues);
  }

  const catalog = buildCatalogBody(manifest);
  assertCatalogComplete(manifest, catalog);

  const fact_ids = catalog.record_types.flatMap((record) => record.facts.map((fact) => fact.fact_id));
  const pack_canonical_digest = computeJcsSha256Digest(buildCanonicalPackManifest(manifest));
  const catalog_digest = computeCatalogDigest(fact_ids);
  const catalog_body_digest = computeJcsSha256Digest(catalog);
  const output_schema_digest = computeOutputSchemaDigest();

  let pack_digest = "";
  if (options.manifestBytes !== undefined) {
    pack_digest = computePackDigest(options.manifestBytes);
  }

  return {
    pack_id: manifest.pack_id,
    pack_version: manifest.pack_version,
    catalog_fact_count: fact_ids.length,
    fact_ids,
    catalog,
    pack_digest,
    pack_canonical_digest,
    catalog_digest,
    catalog_body_digest,
    output_schema_digest,
  };
}

/** Observability-safe summary (no pack prose or document text). */
export function summarizePackFactCatalog(result: PackFactCatalogResult): {
  pack_id: string;
  pack_version: string;
  catalog_fact_count: number;
  pack_digest?: string;
  pack_canonical_digest: string;
  catalog_digest: string;
  catalog_body_digest: string;
  output_schema_digest: string;
} {
  return {
    pack_id: result.pack_id,
    pack_version: result.pack_version,
    catalog_fact_count: result.catalog_fact_count,
    ...(result.pack_digest ? { pack_digest: result.pack_digest } : {}),
    pack_canonical_digest: result.pack_canonical_digest,
    catalog_digest: result.catalog_digest,
    catalog_body_digest: result.catalog_body_digest,
    output_schema_digest: result.output_schema_digest,
  };
}
