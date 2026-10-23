import type {
  GetIntentResponseV1,
  InsertIntentResponseV1,
  RunArtifactV1,
  StudyRunSafeV1,
  StudyRunTriggerV1,
} from "@hiveforyou/contracts/study-runs/v1";
import { classifyPersistenceSqlError } from "./persistence-sql-errors.js";

export class StudyRunPersistenceError extends Error {
  readonly boundary = classifyPersistenceSqlError(this);

  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "StudyRunPersistenceError";
  }
}

function unwrapRpc<T>(label: string, data: T | null, error: { message: string } | null): T {
  if (error) {
    throw new StudyRunPersistenceError(`${label}: ${error.message}`, error);
  }
  if (data === null || data === undefined) {
    throw new StudyRunPersistenceError(`${label}: empty RPC response`);
  }
  return data;
}

export type StudyRunPersistenceClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function insertIntent(
  client: StudyRunPersistenceClient,
  input: { hiveId: string; requestText: string; clarificationJson?: unknown },
): Promise<InsertIntentResponseV1> {
  const { data, error } = await client.rpc("hive3_p1p_insert_intent", {
    p_hive_id: input.hiveId,
    p_request_text: input.requestText,
    p_clarification_json: input.clarificationJson ?? null,
  });
  return unwrapRpc("insertIntent", data as InsertIntentResponseV1, error);
}

export async function getIntent(
  client: StudyRunPersistenceClient,
  intentId: string,
): Promise<GetIntentResponseV1> {
  const { data, error } = await client.rpc("hive3_p1p_get_intent", {
    p_intent_id: intentId,
  });
  return unwrapRpc("getIntent", data as GetIntentResponseV1, error);
}

export async function enqueueStudyRun(
  client: StudyRunPersistenceClient,
  input: {
    hiveId: string;
    intentId: string | null;
    trigger: StudyRunTriggerV1;
    correlationId: string;
    idempotencyKey?: string | null;
    requestJson?: unknown;
  },
): Promise<StudyRunSafeV1> {
  const { data, error } = await client.rpc("hive3_p1p_enqueue_study_run", {
    p_hive_id: input.hiveId,
    p_intent_id: input.intentId,
    p_trigger: input.trigger,
    p_correlation_id: input.correlationId,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_request_json: input.requestJson ?? null,
  });
  return unwrapRpc("enqueueStudyRun", data as StudyRunSafeV1, error);
}

export async function getStudyRun(
  client: StudyRunPersistenceClient,
  studyRunId: string,
): Promise<StudyRunSafeV1> {
  const { data, error } = await client.rpc("hive3_p1p_get_study_run", {
    p_study_run_id: studyRunId,
  });
  return unwrapRpc("getStudyRun", data as StudyRunSafeV1, error);
}

export async function workerTransitionStudyRun(
  client: StudyRunPersistenceClient,
  input: {
    studyRunId: string;
    status: StudyRunSafeV1["status"];
    stage: StudyRunSafeV1["stage"];
    errorCode?: string | null;
    errorMessageSafe?: string | null;
    modelAlias?: string | null;
    packVersion?: string | null;
  },
): Promise<StudyRunSafeV1> {
  const { data, error } = await client.rpc("hive3_p1p_worker_transition_study_run", {
    p_study_run_id: input.studyRunId,
    p_status: input.status,
    p_stage: input.stage,
    p_error_code: input.errorCode ?? null,
    p_error_message_safe: input.errorMessageSafe ?? null,
    p_model_alias: input.modelAlias ?? null,
    p_pack_version: input.packVersion ?? null,
  });
  return unwrapRpc("workerTransitionStudyRun", data as StudyRunSafeV1, error);
}

export async function workerPutRunArtifact(
  client: StudyRunPersistenceClient,
  input: {
    studyRunId: string;
    artifactKind: string;
    contractVersion: string;
    contentSha256: string;
    payloadJson: unknown;
    revision?: number;
  },
): Promise<RunArtifactV1> {
  const { data, error } = await client.rpc("hive3_p1p_worker_put_run_artifact", {
    p_study_run_id: input.studyRunId,
    p_artifact_kind: input.artifactKind,
    p_contract_version: input.contractVersion,
    p_content_sha256: input.contentSha256,
    p_payload_jsonb: input.payloadJson,
    p_revision: input.revision ?? 1,
    p_storage_path: null,
  });
  return unwrapRpc("workerPutRunArtifact", data as RunArtifactV1, error);
}

export async function workerGetRunArtifact(
  client: StudyRunPersistenceClient,
  input: { studyRunId: string; artifactKind: string; revision?: number },
): Promise<RunArtifactV1> {
  const { data, error } = await client.rpc("hive3_p1p_worker_get_run_artifact", {
    p_study_run_id: input.studyRunId,
    p_artifact_kind: input.artifactKind,
    p_revision: input.revision ?? 1,
  });
  return unwrapRpc("workerGetRunArtifact", data as RunArtifactV1, error);
}
