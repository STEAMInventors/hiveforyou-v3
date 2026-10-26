export { computePackDigest, computeSchemaHash } from "./schema-hash.js";
export { serializePackJcs } from "./pack-jcs.js";
export { computeJcsSha256Digest, computeSha256Digest, computeSha256Hex } from "./pack-digest.js";
export {
  PACK_EXTRACTION_CANDIDATE_KEY_VERSION,
  computePackCandidateKey,
  type PackCandidateKeyInputV1,
} from "./pack-candidate-key.js";
export { normalizeQuoteText, quoteFoundInPageText } from "./quote-evidence.js";
export {
  DOCUMENT_PAGE_SET_DIGEST_VERSION,
  computePageSetDigest,
} from "./persisted-page-set-digest.js";
export {
  buildCatalogFactValueSupportContext,
  checkDeterministicValueSupport,
  parsePackFieldSynonyms,
  verifyCandidateFactEvidence,
  type CandidateFactEvidenceInputV1,
  type CatalogFactValueSupportContextV1,
  type ExpectedSourceEvidenceContextV1,
  type PackFieldSynonymEntryV1,
  type PersistedPageCorpusV1,
  type VerifyCandidateFactEvidenceInput,
} from "./evidence-verification.js";
export { buildCanonicalPackManifest } from "./pack-canonical-manifest.js";
export {
  assertValidPackFactCatalog,
  buildPackFactCatalog,
  computeCatalogDigest,
  computeOutputSchemaDigest,
  PackFactCatalogError,
  summarizePackFactCatalog,
  validatePackFactCatalog,
  type BuildPackFactCatalogOptions,
  type PackCatalogFactDefinition,
  type PackCatalogRecordType,
  type PackFactCatalogBody,
  type PackFactCatalogDigests,
  type PackFactCatalogIssue,
  type PackFactCatalogResult,
} from "./pack-fact-catalog.js";
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
