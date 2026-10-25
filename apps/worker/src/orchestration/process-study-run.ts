import type { DomainPackManifestV1 } from "@hiveforyou/contracts/domain-packs/v1";
import type { DomainPackManifestV2 } from "@hiveforyou/contracts/domain-packs/v2";
import { ErrorCode } from "@hiveforyou/contracts/errors/v1";
import { StudyRunStage, StudyRunStatus } from "@hiveforyou/contracts/errors/v1";
import {
  P15_DOCUMENT_PLAN_KIND,
  P15_PROCESSING_RUN_SUMMARY_KIND,
  P15_PROCESSING_SOURCE_SET_KIND,
  RUN_ARTIFACT_CONTRACT_VERSION,
  domainHintFromClarification,
  type WorkerProcessStudyRunRequestV1,
  type WorkerProcessStudyRunResponseV1,
} from "@hiveforyou/contracts/study-runs/v1";

import { loadDomainPacksOrThrow } from "../packs/load-packs.js";
import {
  toReaderSource,
  workerGetProcessingContext,
  workerListRegisteredSources,
} from "../persistence/p15-worker-context.js";
import { putRunArtifactIdempotent } from "../persistence/artifact-idempotent-put.js";
import {
  workerTransitionStudyRun,
  type StudyRunPersistenceClient,
} from "../persistence/study-run-persistence.js";
import { StudyRunPersistenceError } from "../persistence/study-run-persistence.js";
import { compileStudyPlanAndCoverage } from "../plan/compile-study-plan.js";
import { PlanningError, pickSafePlanningDiagnostics } from "../plan/errors.js";
import { buildStudyQuestionSet } from "../plan/plan-questions.js";
import { prepareExtractionPlan } from "../plan/schema-plan.js";
import { loadIepV3CandidateIfPinned } from "../packs/load-pack-v3-candidate.js";
import {
  putStudyPlanArtifact,
  putStudyQuestionCoverageArtifact,
  putStudyQuestionSetArtifact,
} from "../persistence/planning-artifacts.js";
import {
  compilePackSystemPrompt,
  PackPromptCompileError,
  readPackExtractionBudget,
  resolvePackExtractionRoute,
  runPackExtractionForSources,
  type SelectedPack,
} from "../pack-extraction/index.js";
import {
  PackExtractionPersistenceError,
  putPackExtractionPrompt,
  putPackExtractionRefArtifact,
} from "../persistence/pack-extraction-persistence.js";
import type { WorkerRegisteredSourceRowV1 } from "../persistence/p15-worker-context.js";
import { createLiteLlmReasoningClient } from "../reasoning/litellm-client.js";
import { createLiteLlmExtractionClient } from "../reasoning/litellm-extraction-client.js";
import {
  createReaderClient,
  ReaderClientError,
  type ReaderClient,
} from "../reader/reader-client.js";

export class ProcessStudyRunError extends Error {
  readonly diagnostics?: Record<string, string | number | boolean | null>;

  constructor(
    message: string,
    readonly retryable: boolean,
    readonly errorCode: string,
    readonly messageSafe: string,
    diagnostics?: Record<string, string | number | boolean | null>,
  ) {
    super(message);
    this.name = "ProcessStudyRunError";
    if (diagnostics && Object.keys(diagnostics).length > 0) {
      this.diagnostics = diagnostics;
    }
  }
}

async function putArtifactIdempotent(
  client: StudyRunPersistenceClient,
  input: {
    studyRunId: string;
    artifactKind: string;
    payload: unknown;
    revision?: number;
  },
): Promise<void> {
  await putRunArtifactIdempotent(client, {
    studyRunId: input.studyRunId,
    artifactKind: input.artifactKind,
    contractVersion: RUN_ARTIFACT_CONTRACT_VERSION,
    payload: input.payload,
    revision: input.revision ?? 1,
  });
}

async function markPermanentFailure(
  client: StudyRunPersistenceClient,
  studyRunId: string,
  errorCode: string,
  messageSafe: string,
  stage: (typeof StudyRunStage)[keyof typeof StudyRunStage],
): Promise<void> {
  try {
    await workerTransitionStudyRun(client, {
      studyRunId,
      status: StudyRunStatus.FAILED,
      stage,
      errorCode,
      errorMessageSafe: messageSafe,
    });
  } catch (error) {
    if (
      error instanceof StudyRunPersistenceError &&
      error.boundary?.message_safe.includes("already finished")
    ) {
      return;
    }
    throw error;
  }
}

type DocumentPlanSummary = {
  source_document_id: string;
  document_type_id: string | null;
  domain_id: string | null;
  pack_id: string | null;
  candidate_field_count: number;
};

type SafeFailure = {
  errorCode: string;
  messageSafe: string;
  retryable: boolean;
  diagnostics?: Record<string, string | number | boolean | null>;
};

async function failRun(
  persistence: StudyRunPersistenceClient,
  studyRunId: string,
  stage: (typeof StudyRunStage)[keyof typeof StudyRunStage],
  failure: SafeFailure,
): Promise<never> {
  if (!failure.retryable) {
    await markPermanentFailure(persistence, studyRunId, failure.errorCode, failure.messageSafe, stage);
  }
  throw new ProcessStudyRunError(
    failure.messageSafe,
    failure.retryable,
    failure.errorCode,
    failure.messageSafe,
    failure.diagnostics ? pickSafePlanningDiagnostics(failure.diagnostics) : undefined,
  );
}

function safeFailureFrom(error: unknown): SafeFailure | null {
  if (error instanceof PlanningError) {
    return {
      errorCode: error.errorCode,
      messageSafe: error.message,
      retryable: error.retryable,
      diagnostics: error.diagnostics,
    };
  }
  if (error instanceof PackExtractionPersistenceError) {
    return {
      errorCode: error.errorCode,
      messageSafe: error.message,
      retryable: error.retryable,
      diagnostics: { reason: error.reason },
    };
  }
  if (error instanceof ReaderClientError) {
    return { errorCode: error.errorCode, messageSafe: error.message, retryable: error.retryable };
  }
  return null;
}

/** Selected-Pack branch (P2.2-PX.I): plan_schema = compile + prompt store; extract = call + validate + persist. */
async function runSelectedPackExtraction(
  persistence: StudyRunPersistenceClient,
  input: {
    studyRunId: string;
    correlationId: string;
    ownerUserId: string;
    sources: WorkerRegisteredSourceRowV1[];
    selected: SelectedPack;
    reader: ReaderClient;
  },
): Promise<DocumentPlanSummary[]> {
  const { studyRunId, selected } = input;

  await workerTransitionStudyRun(persistence, {
    studyRunId,
    status: StudyRunStatus.RUNNING,
    stage: StudyRunStage.PLAN_SCHEMA,
    packVersion: selected.manifest.pack_version,
  });

  let compiled;
  try {
    compiled = compilePackSystemPrompt(selected.manifest, { manifestBytes: selected.manifestBytes });
  } catch (error) {
    if (error instanceof PackPromptCompileError) {
      const catalogIncomplete = error.issues.some((issue) => issue.code === "CATALOG_INCOMPLETE");
      return failRun(persistence, studyRunId, StudyRunStage.PLAN_SCHEMA, {
        errorCode: ErrorCode.EXTRACTION_FAILED,
        messageSafe: "The Domain Pack could not be prepared for extraction.",
        retryable: false,
        diagnostics: { reason: catalogIncomplete ? "catalog_incomplete" : "prompt_compile_failed" },
      });
    }
    throw error;
  }

  let extraction;
  try {
    extraction = createLiteLlmExtractionClient();
  } catch (error) {
    const failure = safeFailureFrom(error);
    if (failure) {
      return failRun(persistence, studyRunId, StudyRunStage.PLAN_SCHEMA, failure);
    }
    throw error;
  }
  const modelAlias = process.env.WORKER_P2_EXTRACTION_LITELLM_ALIAS?.trim() ?? "";

  try {
    await putPackExtractionPrompt(persistence, { compiled, studyRunId });
    await putPackExtractionRefArtifact(persistence, { studyRunId, compiled });
  } catch (error) {
    const failure = safeFailureFrom(error);
    if (failure) {
      return failRun(persistence, studyRunId, StudyRunStage.PLAN_SCHEMA, failure);
    }
    throw error;
  }

  await workerTransitionStudyRun(persistence, {
    studyRunId,
    status: StudyRunStatus.RUNNING,
    stage: StudyRunStage.EXTRACT,
    modelAlias,
  });

  let result;
  try {
    result = await runPackExtractionForSources({
      persistence,
      reader: input.reader,
      extraction,
      compiled,
      documentTypeIds: new Set(selected.manifest.document_types.map((type) => type.document_type_id)),
      domainId: selected.domainId,
      modelAlias,
      budget: readPackExtractionBudget(),
      studyRunId,
      correlationId: input.correlationId,
      ownerUserId: input.ownerUserId,
      sources: input.sources,
    });
  } catch (error) {
    const failure = safeFailureFrom(error);
    if (failure) {
      return failRun(persistence, studyRunId, StudyRunStage.EXTRACT, failure);
    }
    throw error;
  }

  if (result.unusableDocumentCount > 0) {
    return failRun(persistence, studyRunId, StudyRunStage.EXTRACT, {
      errorCode: ErrorCode.EXTRACTION_FAILED,
      messageSafe: `${result.unusableDocumentCount} of ${result.documents.length} documents could not be extracted.`,
      retryable: false,
      diagnostics: { reason: "documents_unusable" },
    });
  }

  return result.documents.map((doc) => ({
    source_document_id: doc.source_document_id,
    document_type_id: doc.document_type_id,
    domain_id: doc.domain_id,
    pack_id: doc.pack_id,
    candidate_field_count: doc.candidate_field_count,
  }));
}

async function finalizeProcessing(
  persistence: StudyRunPersistenceClient,
  input: {
    studyRunId: string;
    correlationId: string;
    planSummaries: DocumentPlanSummary[];
    frozenQuestionSet: Awaited<ReturnType<typeof buildStudyQuestionSet>> | null;
    iepV3Candidate: ReturnType<typeof loadIepV3CandidateIfPinned>;
  },
): Promise<WorkerProcessStudyRunResponseV1> {
  const { studyRunId, correlationId, planSummaries, frozenQuestionSet, iepV3Candidate } = input;
  await putArtifactIdempotent(persistence, {
    studyRunId,
    artifactKind: P15_PROCESSING_RUN_SUMMARY_KIND,
    payload: {
      document_count: planSummaries.length,
      documents: planSummaries,
    },
  });

  if (frozenQuestionSet) {
    const compiled = compileStudyPlanAndCoverage({
      questionSet: frozenQuestionSet,
      pack: iepV3Candidate?.manifest ?? null,
      classifiedDocuments: planSummaries.map((row) => ({
        source_document_id: row.source_document_id,
        document_type_id: row.document_type_id,
      })),
    });
    await putStudyPlanArtifact(persistence, {
      studyRunId,
      payload: compiled.plan,
      correlationId,
    });
    await putStudyQuestionCoverageArtifact(persistence, {
      studyRunId,
      payload: compiled.coverage,
      correlationId,
    });
  }

  const finished = await workerTransitionStudyRun(persistence, {
    studyRunId,
    status: StudyRunStatus.SUCCEEDED,
    stage: StudyRunStage.FINALIZE,
  });

  return {
    contract_version: "worker-process-study-run@1",
    study_run_id: studyRunId,
    status: finished.status,
    stage: finished.stage,
    idempotent_replay: false,
  };
}

export async function processStudyRun(
  persistence: StudyRunPersistenceClient,
  request: WorkerProcessStudyRunRequestV1,
): Promise<WorkerProcessStudyRunResponseV1> {
  const { study_run_id: studyRunId, hive_id: hiveId, correlation_id: correlationId } = request;

  const context = await workerGetProcessingContext(persistence, studyRunId);
  const run = context.studyRun;

  if (run.hive_id !== hiveId) {
    throw new ProcessStudyRunError(
      "hive mismatch",
      false,
      ErrorCode.INVALID_REQUEST,
      "This processing run does not match the Hive.",
    );
  }

  if (
    run.status === StudyRunStatus.SUCCEEDED ||
    run.status === StudyRunStatus.FAILED ||
    run.status === StudyRunStatus.CANCELLED
  ) {
    return {
      contract_version: "worker-process-study-run@1",
      study_run_id: studyRunId,
      status: run.status,
      stage: run.stage,
      idempotent_replay: true,
    };
  }

  const reader = createReaderClient();
  const packsRoot = process.env.DOMAIN_PACKS_ROOT?.trim();
  const packs = packsRoot ? loadDomainPacksOrThrow(packsRoot) : [];
  const reasoning = createLiteLlmReasoningClient();
  const questionPlanningEnabled = process.env.WORKER_ENABLE_QUESTION_PLANNING?.trim() !== "0";
  const iepV3Candidate = loadIepV3CandidateIfPinned();

  let frozenQuestionSet: Awaited<ReturnType<typeof buildStudyQuestionSet>> | null = null;

  if (questionPlanningEnabled) {
    await workerTransitionStudyRun(persistence, {
      studyRunId,
      status: StudyRunStatus.RUNNING,
      stage: StudyRunStage.PLAN_QUESTIONS,
      packVersion: iepV3Candidate?.manifest.pack_version ?? undefined,
    });

    if (!run.intent_id) {
      await markPermanentFailure(
        persistence,
        studyRunId,
        ErrorCode.INVALID_REQUEST,
        "This run is missing private intent metadata.",
        StudyRunStage.PLAN_QUESTIONS,
      );
      throw new ProcessStudyRunError(
        "missing intent",
        false,
        ErrorCode.INVALID_REQUEST,
        "This run is missing private intent metadata.",
      );
    }

    try {
      frozenQuestionSet = await buildStudyQuestionSet({
        studyRunId,
        intentId: run.intent_id,
        intentText: context.intentRequestText,
        pack: iepV3Candidate,
        reasoning,
        correlationId,
      });
      await putStudyQuestionSetArtifact(persistence, {
        studyRunId,
        payload: frozenQuestionSet,
        correlationId,
      });
    } catch (error) {
      if (error instanceof PlanningError) {
        await markPermanentFailure(
          persistence,
          studyRunId,
          error.errorCode,
          error.message,
          StudyRunStage.PLAN_QUESTIONS,
        );
        throw new ProcessStudyRunError(
          error.message,
          error.retryable,
          error.errorCode,
          error.message,
          pickSafePlanningDiagnostics(error.diagnostics),
        );
      }
      throw error;
    }
  }

  await workerTransitionStudyRun(persistence, {
    studyRunId,
    status: StudyRunStatus.RUNNING,
    stage: StudyRunStage.LOAD_SOURCES,
  });

  const sourceRows = await workerListRegisteredSources(persistence, studyRunId);
  if (sourceRows.length === 0) {
    await markPermanentFailure(
      persistence,
      studyRunId,
      ErrorCode.COVERAGE_INCOMPLETE,
      "No registered documents were available for this run.",
      StudyRunStage.LOAD_SOURCES,
    );
    throw new ProcessStudyRunError(
      "no sources",
      false,
      ErrorCode.COVERAGE_INCOMPLETE,
      "No registered documents were available for this run.",
    );
  }

  const sourceSetPayload = {
    source_document_ids: sourceRows.map((row) => row.source_document_id),
    count: sourceRows.length,
  };
  await putArtifactIdempotent(persistence, {
    studyRunId,
    artifactKind: P15_PROCESSING_SOURCE_SET_KIND,
    payload: sourceSetPayload,
  });

  let selectedPack: SelectedPack | null;
  try {
    const route = resolvePackExtractionRoute({
      packs,
      domainHint: domainHintFromClarification(context.intentClarificationJson),
    });
    selectedPack = route.kind === "selected_pack" ? route.pack : null;
  } catch (error) {
    const failure = safeFailureFrom(error);
    if (failure) {
      return failRun(persistence, studyRunId, StudyRunStage.PLAN_SCHEMA, failure);
    }
    throw error;
  }

  if (selectedPack) {
    const planSummaries = await runSelectedPackExtraction(persistence, {
      studyRunId,
      correlationId,
      ownerUserId: context.ownerUserId,
      sources: sourceRows,
      selected: selectedPack,
      reader,
    });
    return finalizeProcessing(persistence, {
      studyRunId,
      correlationId,
      planSummaries,
      frozenQuestionSet: questionPlanningEnabled ? frozenQuestionSet : null,
      iepV3Candidate,
    });
  }

  await workerTransitionStudyRun(persistence, {
    studyRunId,
    status: StudyRunStatus.RUNNING,
    stage: StudyRunStage.PLAN_SCHEMA,
  });

  const planSummaries: DocumentPlanSummary[] = [];

  for (const row of sourceRows) {
    const source = toReaderSource(row, context.ownerUserId);
    const batchId = row.source_document_id;

    let readResult;
    try {
      readResult = await reader.readDocument({
        source,
        correlationId,
        studyRunId,
        extractionBatchId: batchId,
      });
    } catch (error) {
      if (error instanceof ReaderClientError) {
        if (!error.retryable) {
          await markPermanentFailure(
            persistence,
            studyRunId,
            error.errorCode,
            error.message,
            StudyRunStage.PLAN_SCHEMA,
          );
        }
        throw new ProcessStudyRunError(
          error.message,
          error.retryable,
          error.errorCode,
          error.message,
        );
      }
      throw error;
    }

    let plan;
    try {
      plan = await prepareExtractionPlan({
        intent_text: context.intentRequestText,
        classificationInput: {
          source_document_id: source.source_document_id,
          filename: source.filename,
          pages: readResult.pages.map((page) => ({
            page_number: page.page_number,
            text: page.text,
          })),
          domain_hint: domainHintFromClarification(context.intentClarificationJson),
          packs: packs.map(
            (pack) => pack.manifest as DomainPackManifestV1 | DomainPackManifestV2,
          ),
          correlation_id: correlationId,
          study_run_id: studyRunId,
        },
        packs: packs as { manifest: DomainPackManifestV1 | DomainPackManifestV2; digest: string }[],
        reasoning,
      });
    } catch {
      await markPermanentFailure(
        persistence,
        studyRunId,
        ErrorCode.EXTRACTION_FAILED,
        "Document planning failed.",
        StudyRunStage.PLAN_SCHEMA,
      );
      throw new ProcessStudyRunError(
        "plan failed",
        false,
        ErrorCode.EXTRACTION_FAILED,
        "Document planning failed.",
      );
    }

    await putArtifactIdempotent(persistence, {
      studyRunId,
      artifactKind: `${P15_DOCUMENT_PLAN_KIND}:${source.source_document_id}`,
      payload: {
        source_document_id: source.source_document_id,
        document_type_id: plan.classification.chosen.document_type_id,
        domain_id: plan.classification.chosen.domain_id,
        pack_id: plan.classification.chosen.pack_id,
        schema_hash: plan.schema.schema_hash,
        page_count: readResult.page_count,
      },
    });

    await workerTransitionStudyRun(persistence, {
      studyRunId,
      status: StudyRunStatus.RUNNING,
      stage: StudyRunStage.EXTRACT,
    });

    let extractResult;
    try {
      extractResult = await reader.extractCandidates({
        source,
        pages: readResult.pages,
        readFingerprint: readResult.read_fingerprint,
        schema: plan.schema,
        correlationId,
        studyRunId,
        extractionBatchId: batchId,
      });
    } catch (error) {
      if (error instanceof ReaderClientError) {
        if (!error.retryable) {
          await markPermanentFailure(
            persistence,
            studyRunId,
            error.errorCode,
            error.message,
            StudyRunStage.EXTRACT,
          );
        }
        throw new ProcessStudyRunError(
          error.message,
          error.retryable,
          error.errorCode,
          error.message,
        );
      }
      throw error;
    }

    if (extractResult.status !== "SUCCEEDED") {
      await markPermanentFailure(
        persistence,
        studyRunId,
        ErrorCode.EXTRACTION_FAILED,
        "Candidate extraction did not complete.",
        StudyRunStage.EXTRACT,
      );
      throw new ProcessStudyRunError(
        "extract failed",
        false,
        ErrorCode.EXTRACTION_FAILED,
        "Candidate extraction did not complete.",
      );
    }

    planSummaries.push({
      source_document_id: source.source_document_id,
      document_type_id: plan.classification.chosen.document_type_id,
      domain_id: plan.classification.chosen.domain_id,
      pack_id: plan.classification.chosen.pack_id,
      candidate_field_count: extractResult.extraction.candidates.length,
    });
  }

  return finalizeProcessing(persistence, {
    studyRunId,
    correlationId,
    planSummaries,
    frozenQuestionSet: questionPlanningEnabled ? frozenQuestionSet : null,
    iepV3Candidate,
  });
}
