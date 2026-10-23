"use client";

import type { ErrorEnvelopeV1 } from "@hiveforyou/contracts/errors/v1";
import type {
  HiveProcessingHandoffV1,
  SubmitStudyProcessingRequestV1,
  SubmitStudyProcessingResponseV1,
} from "@hiveforyou/contracts/study-runs/v1";
import type {
  StudyRunPlanningSummarySafeV1,
  StudyRunSafeV1,
} from "@hiveforyou/contracts/study-runs/v1";

import { CORRELATION_HEADER } from "@/lib/correlation/constants";

function correlationId(): string {
  return crypto.randomUUID();
}

function isEnvelope(value: unknown): value is ErrorEnvelopeV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    "contract_version" in value &&
    "error_code" in value
  );
}

export class StudyRunApiError extends Error {
  readonly envelope: ErrorEnvelopeV1;
  readonly status: number;

  constructor(envelope: ErrorEnvelopeV1, status: number) {
    super(envelope.message_safe);
    this.envelope = envelope;
    this.status = status;
  }
}

export async function submitStudyRun(
  hiveId: string,
  body: SubmitStudyProcessingRequestV1,
): Promise<SubmitStudyProcessingResponseV1> {
  const cid = correlationId();
  const response = await fetch(`/api/v1/hives/${encodeURIComponent(hiveId)}/study-runs/submit`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      [CORRELATION_HEADER]: cid,
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as SubmitStudyProcessingResponseV1 | ErrorEnvelopeV1;
  if (!response.ok || isEnvelope(payload)) {
    throw new StudyRunApiError(
      isEnvelope(payload)
        ? payload
        : {
            contract_version: "error-envelope@1",
            error_code: "DEPENDENCY_UNAVAILABLE",
            category: "dependency",
            retryable: true,
            message_safe: "Could not start processing.",
            correlation_id: cid,
          },
      response.status,
    );
  }
  return payload;
}

export async function fetchStudyRunStatus(
  hiveId: string,
  studyRunId: string,
): Promise<{ study_run: StudyRunSafeV1; planning_summary: StudyRunPlanningSummarySafeV1 | null }> {
  const cid = correlationId();
  const response = await fetch(
    `/api/v1/hives/${encodeURIComponent(hiveId)}/study-runs/${encodeURIComponent(studyRunId)}`,
    {
      credentials: "same-origin",
      headers: { [CORRELATION_HEADER]: cid },
    },
  );
  const payload = (await response.json()) as
    | { study_run: StudyRunSafeV1; planning_summary: StudyRunPlanningSummarySafeV1 | null }
    | ErrorEnvelopeV1;
  if (!response.ok || isEnvelope(payload)) {
    throw new StudyRunApiError(
      isEnvelope(payload)
        ? payload
        : {
            contract_version: "error-envelope@1",
            error_code: "DEPENDENCY_UNAVAILABLE",
            category: "dependency",
            retryable: true,
            message_safe: "Could not load processing status.",
            correlation_id: cid,
          },
      response.status,
    );
  }
  return payload;
}

export async function fetchHiveProcessingHandoff(hiveId: string): Promise<HiveProcessingHandoffV1> {
  const cid = correlationId();
  const response = await fetch(`/api/v1/hives/${encodeURIComponent(hiveId)}/study-runs`, {
    credentials: "same-origin",
    headers: { [CORRELATION_HEADER]: cid },
  });
  const payload = (await response.json()) as HiveProcessingHandoffV1 | ErrorEnvelopeV1;
  if (!response.ok || isEnvelope(payload)) {
    throw new StudyRunApiError(
      isEnvelope(payload)
        ? payload
        : {
            contract_version: "error-envelope@1",
            error_code: "DEPENDENCY_UNAVAILABLE",
            category: "dependency",
            retryable: true,
            message_safe: "Could not load processing status.",
            correlation_id: cid,
          },
      response.status,
    );
  }
  return payload;
}
