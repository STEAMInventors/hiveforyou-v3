"use client";

import type { ListDocumentsResponseV1, UploadQuotaResponseV1 } from "@hiveforyou/contracts/documents/v1";
import type { ErrorEnvelopeV1 } from "@hiveforyou/contracts/errors/v1";

import { CORRELATION_HEADER } from "@/lib/correlation/constants";

import { DocumentApiError } from "./upload-batch";

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

async function getJson<T>(path: string): Promise<T> {
  const cid = correlationId();
  const response = await fetch(path, {
    headers: { [CORRELATION_HEADER]: cid },
    credentials: "same-origin",
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
            message_safe: "Could not load documents.",
            correlation_id: cid,
          },
      response.status,
    );
  }
  return body;
}

export async function fetchHiveDocuments(hiveId: string): Promise<ListDocumentsResponseV1> {
  return getJson(`/api/v1/hives/${hiveId}/documents`);
}

export async function fetchUploadQuota(): Promise<UploadQuotaResponseV1> {
  return getJson("/api/v1/documents/quota");
}
