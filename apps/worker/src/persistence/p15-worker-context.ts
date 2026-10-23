import type { StudyRunSafeV1 } from "@hiveforyou/contracts/study-runs/v1";
import type { ReaderReadDocumentSourceV1 } from "@hiveforyou/contracts/reader/v1";
import { HIVE_SOURCE_DOCUMENTS_BUCKET } from "@hiveforyou/contracts/reader/v1";

import { StudyRunPersistenceError, type StudyRunPersistenceClient } from "./study-run-persistence.js";

function unwrapRpc<T>(label: string, data: T | null, error: { message: string } | null): T {
  if (error) {
    throw new StudyRunPersistenceError(`${label}: ${error.message}`, error);
  }
  if (data === null || data === undefined) {
    throw new StudyRunPersistenceError(`${label}: empty RPC response`);
  }
  return data;
}

export type WorkerProcessingContextV1 = {
  studyRun: StudyRunSafeV1;
  ownerUserId: string;
  intentRequestText: string;
  intentClarificationJson: unknown;
};

export async function workerGetProcessingContext(
  client: StudyRunPersistenceClient,
  studyRunId: string,
): Promise<WorkerProcessingContextV1> {
  const { data, error } = await client.rpc("hive3_p15_worker_get_processing_context", {
    p_study_run_id: studyRunId,
  });
  const row = unwrapRpc("workerGetProcessingContext", data as Record<string, unknown>, error);
  return {
    studyRun: row.study_run as StudyRunSafeV1,
    ownerUserId: String(row.owner_user_id),
    intentRequestText: String(row.intent_request_text ?? ""),
    intentClarificationJson: row.intent_clarification_json,
  };
}

export type WorkerRegisteredSourceRowV1 = {
  source_document_id: string;
  hive_id: string;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  filename: string;
};

export async function workerListRegisteredSources(
  client: StudyRunPersistenceClient,
  studyRunId: string,
): Promise<WorkerRegisteredSourceRowV1[]> {
  const { data, error } = await client.rpc("hive3_p15_worker_list_registered_sources", {
    p_study_run_id: studyRunId,
  });
  const list = unwrapRpc("workerListRegisteredSources", data as WorkerRegisteredSourceRowV1[], error);
  return Array.isArray(list) ? list : [];
}

export function toReaderSource(
  row: WorkerRegisteredSourceRowV1,
  ownerUserId: string,
): ReaderReadDocumentSourceV1 {
  return {
    source_document_id: row.source_document_id,
    hive_id: row.hive_id,
    owner_user_id: ownerUserId,
    storage_bucket: HIVE_SOURCE_DOCUMENTS_BUCKET,
    storage_path: row.storage_path,
    mime_type: row.mime_type,
    byte_size: row.byte_size,
    sha256: row.sha256,
    filename: row.filename,
  };
}
