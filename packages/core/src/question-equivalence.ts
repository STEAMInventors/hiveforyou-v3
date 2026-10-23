export type EquivalenceFeaturesV1 = {
  subject: string | null;
  time_period: string | null;
  population: string | null;
  document_scope: string | null;
  qualifiers: string | null;
};

export type EquivalenceDecisionV1 = {
  can_merge: boolean;
  reason_codes: string[];
};

function norm(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

export function equivalenceFeaturesAlign(
  left: EquivalenceFeaturesV1,
  right: EquivalenceFeaturesV1,
): EquivalenceDecisionV1 {
  const reason_codes: string[] = [];
  const dimensions: (keyof EquivalenceFeaturesV1)[] = [
    "subject",
    "time_period",
    "population",
    "document_scope",
    "qualifiers",
  ];
  for (const dimension of dimensions) {
    const a = norm(left[dimension]);
    const b = norm(right[dimension]);
    if (a !== null && b !== null && a !== b) {
      reason_codes.push(`${dimension}_mismatch`);
    }
  }
  if (reason_codes.length > 0) {
    return { can_merge: false, reason_codes };
  }
  return { can_merge: true, reason_codes: ["equivalence_features_aligned"] };
}

export function featuresFromRecord(raw: Record<string, unknown>): EquivalenceFeaturesV1 {
  const features = (raw.features ?? raw) as Record<string, unknown>;
  return {
    subject: typeof features.subject === "string" ? features.subject : null,
    time_period: typeof features.time_period === "string" ? features.time_period : null,
    population: typeof features.population === "string" ? features.population : null,
    document_scope: typeof features.document_scope === "string" ? features.document_scope : null,
    qualifiers: typeof features.qualifiers === "string" ? features.qualifiers : null,
  };
}
