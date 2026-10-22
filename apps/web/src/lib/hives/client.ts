"use client";

import type {
  CreateHiveRequestV1,
  CreateHiveResponseV1,
  DeleteHiveResponseV1,
  GetHiveResponseV1,
  ListHivesResponseV1,
} from "@hiveforyou/contracts/hives/v1";
import type { ErrorEnvelopeV1 } from "@hiveforyou/contracts/errors/v1";

import { CORRELATION_HEADER } from "@/lib/correlation/constants";

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

export class HiveApiError extends Error {
  readonly envelope: ErrorEnvelopeV1;
  readonly status: number;

  constructor(envelope: ErrorEnvelopeV1, status: number) {
    super(envelope.message_safe);
    this.envelope = envelope;
    this.status = status;
  }
}

export async function fetchMyHives(): Promise<ListHivesResponseV1> {
  const cid = correlationId();
  const response = await fetch("/api/v1/hives", {
    headers: { [CORRELATION_HEADER]: cid },
    credentials: "same-origin",
  });
  const body = await parseJson<ListHivesResponseV1>(response);
  if (!response.ok || isEnvelope(body)) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.location.href = `/login?next=${encodeURIComponent("/hives")}`;
    }
    throw new HiveApiError(
      isEnvelope(body)
        ? body
        : {
            contract_version: "error-envelope@1",
            error_code: "DEPENDENCY_UNAVAILABLE",
            category: "dependency",
            retryable: true,
            message_safe: "Could not load your Hives.",
            correlation_id: cid,
          },
      response.status,
    );
  }
  return body;
}

export async function fetchHive(hiveId: string): Promise<GetHiveResponseV1> {
  const cid = correlationId();
  const response = await fetch(`/api/v1/hives/${hiveId}`, {
    headers: { [CORRELATION_HEADER]: cid },
    credentials: "same-origin",
  });
  const body = await parseJson<GetHiveResponseV1>(response);
  if (!response.ok || isEnvelope(body)) {
    throw new HiveApiError(
      isEnvelope(body)
        ? body
        : {
            contract_version: "error-envelope@1",
            error_code: "NOT_FOUND",
            category: "not_found",
            retryable: false,
            message_safe: "We could not find that Hive.",
            correlation_id: cid,
          },
      response.status,
    );
  }
  return body;
}

export async function createHive(
  payload: CreateHiveRequestV1,
): Promise<CreateHiveResponseV1> {
  const cid = correlationId();
  const response = await fetch("/api/v1/hives", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [CORRELATION_HEADER]: cid,
    },
    credentials: "same-origin",
    body: JSON.stringify(payload),
  });
  const body = await parseJson<CreateHiveResponseV1>(response);
  if (!response.ok || isEnvelope(body)) {
    throw new HiveApiError(
      isEnvelope(body)
        ? body
        : {
            contract_version: "error-envelope@1",
            error_code: "DEPENDENCY_UNAVAILABLE",
            category: "dependency",
            retryable: true,
            message_safe: "Could not create your Hive.",
            correlation_id: cid,
          },
      response.status,
    );
  }
  return body;
}

export async function deleteHive(hiveId: string): Promise<DeleteHiveResponseV1> {
  const cid = correlationId();
  const response = await fetch(`/api/v1/hives/${hiveId}`, {
    method: "DELETE",
    headers: { [CORRELATION_HEADER]: cid },
    credentials: "same-origin",
  });
  const body = await parseJson<DeleteHiveResponseV1>(response);
  if (!response.ok || isEnvelope(body)) {
    throw new HiveApiError(
      isEnvelope(body)
        ? body
        : {
            contract_version: "error-envelope@1",
            error_code: "DEPENDENCY_UNAVAILABLE",
            category: "dependency",
            retryable: true,
            message_safe: "Could not delete this Hive.",
            correlation_id: cid,
          },
      response.status,
    );
  }
  return body;
}
