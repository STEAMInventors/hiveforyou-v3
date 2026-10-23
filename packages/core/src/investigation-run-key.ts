import { createHash } from "node:crypto";

export type InvestigationRunKeyInputV1 = {
  investigation_id: string;
  operator_id: string;
  operator_version: string;
  parameter_scope_hash: string;
  evidence_scope_hash: string;
  based_on_revision_id: string | null;
};

export function computeInvestigationRunKey(input: InvestigationRunKeyInputV1): string {
  const payload = [
    input.investigation_id,
    input.operator_id,
    input.operator_version,
    input.parameter_scope_hash,
    input.evidence_scope_hash,
    input.based_on_revision_id ?? "none",
  ].join("|");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function computeParameterScopeHash(parts: string[]): string {
  const normalized = parts.map((part) => part.trim().toLowerCase()).filter(Boolean).sort();
  return createHash("sha256").update(normalized.join("|"), "utf8").digest("hex");
}
