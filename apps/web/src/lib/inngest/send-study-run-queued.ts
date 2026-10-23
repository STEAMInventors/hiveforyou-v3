import "server-only";

import type { StudyRunQueuedEventDataV1 } from "@hiveforyou/contracts/study-runs/v1";

import { inngest } from "./client";

export async function sendStudyRunQueuedEvent(event: {
  name: string;
  data: StudyRunQueuedEventDataV1;
}): Promise<void> {
  const eventKey = process.env.INNGEST_EVENT_KEY?.trim();
  if (!eventKey) {
    throw new Error("INNGEST_EVENT_KEY is not configured.");
  }
  await inngest.send({
    name: event.name,
    data: event.data,
    id: event.data.delivery_idempotency_key,
  });
}
