"use client";

import type {
  CompleteDocumentUploadResponseV1,
  PrepareDocumentUploadResponseV1,
  SourceDocumentV1,
  UploadProductPolicyV1,
} from "@hiveforyou/contracts/documents/v1";
import type { ErrorEnvelopeV1 } from "@hiveforyou/contracts/errors/v1";

import { CORRELATION_HEADER } from "@/lib/correlation/constants";
import { sha256Hex } from "@/lib/documents/sha256";
import { validateUploadFile } from "@/lib/documents/validation";

export type UploadBatchItem = {
  file: File;
  client_request_id: string;
  supersedes_document_id?: string;
};

export type UploadBatchProgress = {
  total: number;
  completed: number;
  currentFilename: string | null;
};

export type UploadBatchResult = {
  succeeded: SourceDocumentV1[];
  failed: { client_request_id: string; filename: string; message: string }[];
};

export class DocumentApiError extends Error {
  readonly envelope: ErrorEnvelopeV1;
  readonly status: number;

  constructor(envelope: ErrorEnvelopeV1, status: number) {
    super(envelope.message_safe);
    this.envelope = envelope;
    this.status = status;
  }
}

function correlationId(): string {
  return crypto.randomUUID();
}

async function parseJson<T>(response: Response): Promise<T | ErrorEnvelopeV1> {
  return (await response.json()) as T | ErrorEnvelopeV1;
}

function isEnvelope(value: unknown): value is ErrorEnvelopeV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    "contract_version" in value &&
    "error_code" in value
  );
}

async function postJson<T>(
  path: string,
  payload: unknown,
): Promise<T> {
  const cid = correlationId();
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [CORRELATION_HEADER]: cid,
    },
    credentials: "same-origin",
    body: JSON.stringify(payload),
  });
  const body = await parseJson<T>(response);
  if (!response.ok || isEnvelope(body)) {
    throw new DocumentApiError(
      isEnvelope(body)
        ? body
        : {
            contract_version: "error-envelope@1",
            error_code: "DEPENDENCY_UNAVAILABLE",
            category: "dependency",
            retryable: true,
            message_safe: "Upload failed. Please try again.",
            correlation_id: cid,
          },
      response.status,
    );
  }
  return body;
}

async function putSignedUpload(signedUrl: string, file: File, mimeType: string): Promise<void> {
  const response = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
    },
    body: file,
  });
  if (!response.ok) {
    throw new Error("signed_upload_failed");
  }
}

async function uploadOne(
  hiveId: string,
  item: UploadBatchItem,
  policy: UploadProductPolicyV1,
): Promise<CompleteDocumentUploadResponseV1["complete"]> {
  const validation = validateUploadFile(item.file, policy);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const prepareBody: Record<string, unknown> = {
    client_request_id: item.client_request_id,
    filename: item.file.name,
    mime_type: validation.mime_type,
    byte_size: item.file.size,
  };
  if (item.supersedes_document_id) {
    prepareBody.supersedes_document_id = item.supersedes_document_id;
  }
  const prepared = await postJson<PrepareDocumentUploadResponseV1>(
    `/api/v1/hives/${hiveId}/documents/prepare`,
    prepareBody,
  );

  if (prepared.prepare.status === "pending") {
    await putSignedUpload(prepared.upload.signed_url, item.file, validation.mime_type);
  }

  const digest = await sha256Hex(item.file);
  const completed = await postJson<CompleteDocumentUploadResponseV1>(
    `/api/v1/hives/${hiveId}/documents/complete`,
    {
      client_request_id: item.client_request_id,
      sha256: digest,
      byte_size: item.file.size,
    },
  );
  return completed.complete;
}

export async function uploadDocumentBatch(options: {
  hiveId: string;
  items: UploadBatchItem[];
  policy: UploadProductPolicyV1;
  onProgress?: (progress: UploadBatchProgress) => void;
  signal?: AbortSignal;
}): Promise<UploadBatchResult> {
  const succeeded: SourceDocumentV1[] = [];
  const failed: UploadBatchResult["failed"] = [];
  const total = options.items.length;

  for (let index = 0; index < options.items.length; index += 1) {
    if (options.signal?.aborted) {
      break;
    }
    const item = options.items[index];
    options.onProgress?.({
      total,
      completed: index,
      currentFilename: item.file.name,
    });
    try {
      const complete = await uploadOne(options.hiveId, item, options.policy);
      succeeded.push({
        id: complete.document_id,
        hive_id: options.hiveId,
        client_request_id: item.client_request_id,
        filename: item.file.name,
        mime_type: item.file.type || "application/octet-stream",
        byte_size: item.file.size,
        sha256: null,
        status: "registered",
        created_at: new Date().toISOString(),
        registered_at: complete.registered_at,
      });
    } catch (error) {
      const message =
        error instanceof DocumentApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Upload failed.";
      failed.push({
        client_request_id: item.client_request_id,
        filename: item.file.name,
        message,
      });
      try {
        await postJson(`/api/v1/hives/${options.hiveId}/documents/abort`, {
          client_request_id: item.client_request_id,
          reason: "failed",
        });
      } catch {
        // Best-effort cleanup; server may already have marked failure.
      }
    }
  }

  options.onProgress?.({
    total,
    completed: total,
    currentFilename: null,
  });

  return { succeeded, failed };
}

export async function replaceRegisteredDocument(options: {
  hiveId: string;
  file: File;
  supersedesDocumentId: string;
  policy: UploadProductPolicyV1;
}): Promise<void> {
  await uploadOne(
    options.hiveId,
    {
      file: options.file,
      client_request_id: crypto.randomUUID(),
      supersedes_document_id: options.supersedesDocumentId,
    },
    options.policy,
  );
}
