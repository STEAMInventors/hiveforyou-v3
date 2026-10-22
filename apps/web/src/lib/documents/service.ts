import type { SupabaseClient } from "@supabase/supabase-js";

import { ErrorCode, type ErrorCode as ErrorCodeType } from "@hiveforyou/contracts/errors/v1";
import type {
  CompleteDocumentUploadResponseV1,
  DeleteRegisteredDocumentUploadResponseV1,
  DismissFailedDocumentUploadResponseV1,
  ListDocumentsResponseV1,
  PrepareDocumentUploadResponseV1,
  UploadQuotaResponseV1,
} from "@hiveforyou/contracts/documents/v1";

import {
  DocumentRepositoryError,
  abortDocumentUpload,
  completeDocumentUpload,
  deleteRegisteredDocumentUpload,
  dismissFailedDocumentUpload,
  getUploadQuota,
  listDocumentsForHive,
  prepareDocumentUpload,
} from "./repository";

export type DocumentServiceError = {
  error_code: ErrorCodeType | "QUOTA_EXCEEDED";
  message_safe: string;
  retryable: boolean;
  diagnostic_detail: string;
};

function serviceError(
  error_code: DocumentServiceError["error_code"],
  message_safe: string,
  retryable: boolean,
  diagnostic_detail: string,
): DocumentServiceError {
  return { error_code, message_safe, retryable, diagnostic_detail };
}

function mapRepositoryFailure(failure: DocumentRepositoryError["failure"]): DocumentServiceError {
  const code = failure.error_code;
  if (code === "QUOTA_EXCEEDED") {
    return serviceError("QUOTA_EXCEEDED", failure.message_safe, false, failure.diagnostic_detail);
  }
  const error_code =
    code === "AUTH_FAILED" ||
    code === "ACCESS_DENIED" ||
    code === "NOT_FOUND" ||
    code === "INVALID_REQUEST" ||
    code === "STORAGE_NOT_FOUND" ||
    code === "STORAGE_UNAVAILABLE" ||
    code === "STUDY_SOURCE_LOCKED" ||
    code === "DB_OUTCOME_UNKNOWN" ||
    code === "DEPENDENCY_UNAVAILABLE"
      ? (code as ErrorCodeType)
      : ErrorCode.DEPENDENCY_UNAVAILABLE;
  return serviceError(
    error_code,
    failure.message_safe,
    failure.retryable,
    failure.diagnostic_detail,
  );
}

export async function listHiveDocumentsForUser(
  client: SupabaseClient,
  hiveId: string,
  correlationId: string,
): Promise<{ ok: true; body: ListDocumentsResponseV1 } | { ok: false; error: DocumentServiceError }> {
  try {
    const documents = await listDocumentsForHive(client, hiveId, correlationId);
    return { ok: true, body: { documents } };
  } catch (error) {
    if (error instanceof DocumentRepositoryError) {
      return { ok: false, error: mapRepositoryFailure(error.failure) };
    }
    return {
      ok: false,
      error: serviceError(
        ErrorCode.DEPENDENCY_UNAVAILABLE,
        "Something went wrong. Please try again.",
        true,
        "unknown",
      ),
    };
  }
}

export async function getUploadQuotaForUser(
  client: SupabaseClient,
  correlationId: string,
): Promise<{ ok: true; body: UploadQuotaResponseV1 } | { ok: false; error: DocumentServiceError }> {
  try {
    const body = await getUploadQuota(client, correlationId);
    return { ok: true, body };
  } catch (error) {
    if (error instanceof DocumentRepositoryError) {
      return { ok: false, error: mapRepositoryFailure(error.failure) };
    }
    return {
      ok: false,
      error: serviceError(
        ErrorCode.DEPENDENCY_UNAVAILABLE,
        "Something went wrong. Please try again.",
        true,
        "unknown",
      ),
    };
  }
}

export async function prepareHiveDocumentUploadForUser(
  client: SupabaseClient,
  hiveId: string,
  correlationId: string,
  input: {
    client_request_id: string;
    filename: string;
    mime_type: string;
    byte_size: number;
    supersedes_document_id?: string;
  },
): Promise<
  { ok: true; body: PrepareDocumentUploadResponseV1 } | { ok: false; error: DocumentServiceError }
> {
  try {
    const body = await prepareDocumentUpload(client, hiveId, correlationId, input);
    return { ok: true, body };
  } catch (error) {
    if (error instanceof DocumentRepositoryError) {
      return { ok: false, error: mapRepositoryFailure(error.failure) };
    }
    return {
      ok: false,
      error: serviceError(
        ErrorCode.DEPENDENCY_UNAVAILABLE,
        "Something went wrong. Please try again.",
        true,
        "unknown",
      ),
    };
  }
}

export async function completeHiveDocumentUploadForUser(
  client: SupabaseClient,
  hiveId: string,
  correlationId: string,
  input: { client_request_id: string; sha256: string; byte_size: number },
): Promise<
  { ok: true; body: CompleteDocumentUploadResponseV1 } | { ok: false; error: DocumentServiceError }
> {
  try {
    const body = await completeDocumentUpload(client, hiveId, correlationId, input);
    return { ok: true, body };
  } catch (error) {
    if (error instanceof DocumentRepositoryError) {
      return { ok: false, error: mapRepositoryFailure(error.failure) };
    }
    return {
      ok: false,
      error: serviceError(
        ErrorCode.DEPENDENCY_UNAVAILABLE,
        "Something went wrong. Please try again.",
        true,
        "unknown",
      ),
    };
  }
}

export async function abortHiveDocumentUploadForUser(
  client: SupabaseClient,
  hiveId: string,
  correlationId: string,
  input: { client_request_id: string; reason?: "abandoned" | "failed" },
): Promise<{ ok: true } | { ok: false; error: DocumentServiceError }> {
  try {
    await abortDocumentUpload(client, hiveId, correlationId, input);
    return { ok: true };
  } catch (error) {
    if (error instanceof DocumentRepositoryError) {
      return { ok: false, error: mapRepositoryFailure(error.failure) };
    }
    return {
      ok: false,
      error: serviceError(
        ErrorCode.DEPENDENCY_UNAVAILABLE,
        "Something went wrong. Please try again.",
        true,
        "unknown",
      ),
    };
  }
}

export async function deleteRegisteredHiveDocumentForUser(
  client: SupabaseClient,
  hiveId: string,
  correlationId: string,
  input: { client_request_id: string },
): Promise<
  { ok: true; body: DeleteRegisteredDocumentUploadResponseV1 } | { ok: false; error: DocumentServiceError }
> {
  try {
    const body = await deleteRegisteredDocumentUpload(client, hiveId, correlationId, input);
    return { ok: true, body };
  } catch (error) {
    if (error instanceof DocumentRepositoryError) {
      return { ok: false, error: mapRepositoryFailure(error.failure) };
    }
    return {
      ok: false,
      error: serviceError(
        ErrorCode.DEPENDENCY_UNAVAILABLE,
        "Something went wrong. Please try again.",
        true,
        "unknown",
      ),
    };
  }
}

export async function dismissFailedHiveDocumentForUser(
  client: SupabaseClient,
  hiveId: string,
  correlationId: string,
  input: { client_request_id: string },
): Promise<
  { ok: true; body: DismissFailedDocumentUploadResponseV1 } | { ok: false; error: DocumentServiceError }
> {
  try {
    const body = await dismissFailedDocumentUpload(client, hiveId, correlationId, input);
    return { ok: true, body };
  } catch (error) {
    if (error instanceof DocumentRepositoryError) {
      return { ok: false, error: mapRepositoryFailure(error.failure) };
    }
    return {
      ok: false,
      error: serviceError(
        ErrorCode.DEPENDENCY_UNAVAILABLE,
        "Something went wrong. Please try again.",
        true,
        "unknown",
      ),
    };
  }
}
