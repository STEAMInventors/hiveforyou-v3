import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CompleteDocumentUploadResponseV1,
  DismissFailedDocumentUploadResponseV1,
  ListDocumentsResponseV1,
  PrepareDocumentUploadResponseV1,
  UploadQuotaResponseV1,
} from "@hiveforyou/contracts/documents/v1";

import {
  type DocumentEdgeFailure,
  edgeAbortDocumentUpload,
  edgeCompleteDocumentUpload,
  edgeDismissFailedDocumentUpload,
  edgeGetUploadQuota,
  edgeListDocuments,
  edgePrepareDocumentUpload,
} from "./document-edge-gateway";

export class DocumentRepositoryError extends Error {
  readonly failure: DocumentEdgeFailure;

  constructor(failure: DocumentEdgeFailure) {
    super(failure.message_safe);
    this.failure = failure;
  }
}

async function unwrap<T>(result: { ok: true; data: T } | { ok: false; error: DocumentEdgeFailure }) {
  if (!result.ok) {
    throw new DocumentRepositoryError(result.error);
  }
  return result.data;
}

export async function listDocumentsForHive(
  client: SupabaseClient,
  hiveId: string,
  correlationId: string,
): Promise<ListDocumentsResponseV1["documents"]> {
  const data = await unwrap(await edgeListDocuments(client, correlationId, hiveId));
  return data.documents;
}

export async function getUploadQuota(
  client: SupabaseClient,
  correlationId: string,
): Promise<UploadQuotaResponseV1> {
  return unwrap(await edgeGetUploadQuota(client, correlationId));
}

export async function prepareDocumentUpload(
  client: SupabaseClient,
  hiveId: string,
  correlationId: string,
  input: {
    client_request_id: string;
    filename: string;
    mime_type: string;
    byte_size: number;
  },
): Promise<PrepareDocumentUploadResponseV1> {
  return unwrap(await edgePrepareDocumentUpload(client, correlationId, hiveId, input));
}

export async function completeDocumentUpload(
  client: SupabaseClient,
  hiveId: string,
  correlationId: string,
  input: { client_request_id: string; sha256: string; byte_size: number },
): Promise<CompleteDocumentUploadResponseV1> {
  return unwrap(await edgeCompleteDocumentUpload(client, correlationId, hiveId, input));
}

export async function abortDocumentUpload(
  client: SupabaseClient,
  hiveId: string,
  correlationId: string,
  input: { client_request_id: string; reason?: "abandoned" | "failed" },
): Promise<void> {
  await unwrap(await edgeAbortDocumentUpload(client, correlationId, hiveId, input));
}

export async function dismissFailedDocumentUpload(
  client: SupabaseClient,
  hiveId: string,
  correlationId: string,
  input: { client_request_id: string },
): Promise<DismissFailedDocumentUploadResponseV1> {
  return unwrap(await edgeDismissFailedDocumentUpload(client, correlationId, hiveId, input));
}
