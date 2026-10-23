import type {
  DomainPackCanonicalQuestionV3,
  DomainPackManifestV3,
} from "@hiveforyou/contracts/domain-packs/v3";

const MEETING_RE = /\b(meeting|iep meeting|prepare|ask at)\b/i;
const PROFESSIONAL_RE =
  /\b(advocate|attorney|discrepanc|delivery|evidence gap|professional|conflict|compliance review)\b/i;

export function selectCatalogQuestions(input: {
  manifest: DomainPackManifestV3 | null;
  intentText: string;
  proposedCatalogIds: Set<string>;
}): DomainPackCanonicalQuestionV3[] {
  if (!input.manifest) {
    return [];
  }
  const intent = input.intentText;
  const selected: DomainPackCanonicalQuestionV3[] = [];
  for (const question of input.manifest.views_and_outcomes.canonical_questions) {
    if (question.question_id === "Q04") {
      if (
        PROFESSIONAL_RE.test(intent) ||
        input.proposedCatalogIds.has("Q04")
      ) {
        selected.push(question);
      }
      continue;
    }
    if (question.trigger_policy === "baseline") {
      selected.push(question);
      continue;
    }
    if (question.trigger_policy === "conditional") {
      if (MEETING_RE.test(intent) || input.proposedCatalogIds.has(question.question_id)) {
        selected.push(question);
      }
      continue;
    }
    if (input.proposedCatalogIds.has(question.question_id)) {
      selected.push(question);
    }
  }
  return selected.sort((a, b) => a.priority - b.priority);
}
