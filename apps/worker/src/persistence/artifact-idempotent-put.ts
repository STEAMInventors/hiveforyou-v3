import type { RunArtifactV1 } from "@hiveforyou/contracts/study-runs/v1";

import { sha256JsonPayload } from "./artifact-json-hash.js";
import {
  StudyRunPersistenceError,
  workerGetRunArtifact,
  workerPutRunArtifact,
  type StudyRunPersistenceClient,
} from "./study-run-persistence.js";

export async function putRunArtifactIdempotent(
  client: StudyRunPersistenceClient,
  input: {
    studyRunId: string;
    artifactKind: string;
    contractVersion: string;
    payload: unknown;
    revision?: number;
  },
): Promise<RunArtifactV1> {
  const hash = sha256JsonPayload(input.payload);
  try {
    return await workerPutRunArtifact(client, {
      studyRunId: input.studyRunId,
      artifactKind: input.artifactKind,
      contractVersion: input.contractVersion,
      contentSha256: hash,
      payloadJson: input.payload,
      revision: input.revision ?? 1,
    });
  } catch (error) {
    if (error instanceof StudyRunPersistenceError) {
      const boundary = error.boundary;
      if (boundary?.error_code === "INVALID_REQUEST") {
        const existing = await workerGetRunArtifact(client, {
          studyRunId: input.studyRunId,
          artifactKind: input.artifactKind,
          revision: input.revision ?? 1,
        });
        if (existing.content_sha256 === hash) {
          return existing;
        }
      }
    }
    throw error;
  }
}
