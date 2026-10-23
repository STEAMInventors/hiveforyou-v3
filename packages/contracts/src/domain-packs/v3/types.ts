export const DOMAIN_PACK_MANIFEST_V3 = "domain-pack-manifest@3" as const;
export const DOMAIN_PACK_CONTRACT_PROFILE_FIVE_SECTION = "five-section" as const;

export type DomainPackTriggerPolicyV3 = "baseline" | "conditional" | "relevance";

export type DomainPackCanonicalQuestionV3 = {
  question_id: string;
  canonical_question: string;
  view_ids: string[];
  outcome_ids?: string[];
  priority: number;
  trigger_policy: DomainPackTriggerPolicyV3 | string;
  trigger_conditions?: string[];
  trigger_notes?: string;
  investigation_ids: string[];
  required_concepts?: string[];
  optional_concepts?: string[];
};

export type DomainPackViewsOutcomesV3 = {
  contract_version: string;
  views: { view_id: string; label: string; audience_id: string }[];
  outcomes?: { outcome_id: string; label: string; view_ids: string[] }[];
  canonical_questions: DomainPackCanonicalQuestionV3[];
};

export type DomainPackInvestigationItemV3 = {
  investigation_id: string;
  operator_id: string;
  operator_version: string;
  inputs?: Record<string, unknown>;
  preconditions?: string[];
};

export type DomainPackInvestigationsV3 = {
  operator_allowlist: string[];
  items: DomainPackInvestigationItemV3[];
};

export type DomainPackManifestV3 = {
  contract_version: typeof DOMAIN_PACK_MANIFEST_V3;
  contract_profile: typeof DOMAIN_PACK_CONTRACT_PROFILE_FIVE_SECTION;
  implementation_status?: string;
  pack_id: string;
  pack_version: string;
  review_status: "draft" | "reviewed" | string;
  discovery: Record<string, unknown>;
  concepts: Record<string, unknown>;
  relationships: Record<string, unknown>;
  investigations: DomainPackInvestigationsV3;
  communication: Record<string, unknown>;
  views_and_outcomes: DomainPackViewsOutcomesV3;
  constructs?: Record<string, unknown>;
  vocabulary?: Record<string, unknown>;
  derivations?: Record<string, unknown>;
  regulatory_overlay?: Record<string, unknown>;
  historical_references?: Record<string, unknown>;
  enums?: Record<string, unknown>;
};

export function isDomainPackManifestV3(value: unknown): value is DomainPackManifestV3 {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as DomainPackManifestV3).contract_version === DOMAIN_PACK_MANIFEST_V3
  );
}
