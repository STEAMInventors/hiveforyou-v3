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
import { createLiteLlmReasoningClient } from "../reasoning/litellm-client.js";
import { createReaderClient, ReaderClientError } from "../reader/reader-client.js";

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

  await workerTransitionStudyRun(persistence, {
    studyRunId,
    status: StudyRunStatus.RUNNING,
    stage: StudyRunStage.PLAN_SCHEMA,
  });

  const planSummaries: Array<{
    source_document_id: string;
    document_type_id: string | null;
    domain_id: string | null;
    pack_id: string | null;
    candidate_field_count: number;
  }> = [];

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

  await putArtifactIdempotent(persistence, {
    studyRunId,
    artifactKind: P15_PROCESSING_RUN_SUMMARY_KIND,
    payload: {
      document_count: planSummaries.length,
      documents: planSummaries,
    },
  });

  if (questionPlanningEnabled && frozenQuestionSet) {
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
