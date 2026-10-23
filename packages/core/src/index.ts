export { computePackDigest, computeSchemaHash } from "./schema-hash.js";
export { PackValidationError, parsePackManifest } from "./pack-validation.js";
export {
  normalizeDomainPackManifest,
  recordNestedFieldIds,
  type NormalizedDomainPackManifest,
} from "./pack-normalize.js";
export {
  catalogHasBlockingDiagnostics,
  projectPublicPackMetadata,
  resolvePackCatalog,
  type LoadedPackBytes,
  type PackCatalogDiagnostics,
  type ResolvedDomainPack,
  type ResolvePackCatalogOptions,
} from "./pack-catalog.js";
export { buildFieldGuidanceForDocumentType } from "./field-guidance.js";
export {
  assertValidPackRelationships,
  validatePackRelationships,
  type RelationshipValidationIssue,
} from "./pack-relationships.js";
export {
  scoreAllDocumentTypes,
  scoreDocumentTypeMatch,
  scoreReceiptLikeDocument,
  detectTitleBodyCollision,
  type DocumentTypeScoreV1,
  type MatchScoringContext,
} from "./match-scoring.js";
export { validateDomainPackManifestV3 } from "./pack-manifest-v3-validate.js";
export {
  equivalenceFeaturesAlign,
  featuresFromRecord,
  type EquivalenceDecisionV1,
  type EquivalenceFeaturesV1,
} from "./question-equivalence.js";
export {
  computeInvestigationRunKey,
  computeParameterScopeHash,
  type InvestigationRunKeyInputV1,
} from "./investigation-run-key.js";
export { parseQuestionPlanBudgets, type QuestionPlanBudgetsV1 } from "./question-plan-budgets.js";
