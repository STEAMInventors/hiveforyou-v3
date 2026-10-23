import { describe, expect, it, vi } from "vitest";
import {
  enqueueStudyRun,
  StudyRunPersistenceError,
  workerPutRunArtifact,
} from "./study-run-persistence.js";

describe("study-run-persistence RPC client", () => {
  it("returns idempotent enqueue payload from RPC", async () => {
    const run = {
      id: "run-1",
      hive_id: "hive-1",
      intent_id: "intent-1",
      status: "QUEUED",
      stage: "enqueue",
      trigger: "study",
      correlation_id: "corr-1",
      started_at: null,
      finished_at: null,
      error_code: null,
      error_message_safe: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const rpc = vi.fn().mockResolvedValue({ data: run, error: null });
    const result = await enqueueStudyRun({ rpc }, {
      hiveId: "hive-1",
      intentId: "intent-1",
      trigger: "study",
      correlationId: "corr-1",
      idempotencyKey: "delivery-key-1",
    });
    expect(result.id).toBe("run-1");
    expect(rpc).toHaveBeenCalledWith("hive3_p1p_enqueue_study_run", expect.objectContaining({
      p_idempotency_key: "delivery-key-1",
    }));
  });

  it("surfaces idempotency_hive_mismatch as StudyRunPersistenceError", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "idempotency_hive_mismatch" },
    });
    await expect(
      enqueueStudyRun({ rpc }, {
        hiveId: "hive-b",
        intentId: null,
        trigger: "generate",
        correlationId: "corr-x",
        idempotencyKey: "shared-key",
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(StudyRunPersistenceError);
      const boundary = (err as StudyRunPersistenceError).boundary;
      expect(boundary?.error_code).toBe("ACCESS_DENIED");
      return true;
    });
  });

  it("returns unchanged artifact on retry with same hash", async () => {
    const artifact = {
      id: "art-1",
      study_run_id: "run-1",
      hive_id: "hive-1",
      artifact_kind: "gate1-smoke@1",
      contract_version: "run-artifact@1",
      revision: 1,
      content_sha256: "abc123",
      payload_jsonb: { step: "smoke" },
      storage_path: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    const rpc = vi.fn().mockResolvedValue({ data: artifact, error: null });
    const first = await workerPutRunArtifact({ rpc }, {
      studyRunId: "run-1",
      artifactKind: "gate1-smoke@1",
      contractVersion: "run-artifact@1",
      contentSha256: "abc123",
      payloadJson: { step: "smoke" },
    });
    const second = await workerPutRunArtifact({ rpc }, {
      studyRunId: "run-1",
      artifactKind: "gate1-smoke@1",
      contractVersion: "run-artifact@1",
      contentSha256: "abc123",
      payloadJson: { step: "smoke" },
    });
    expect(first.id).toBe(second.id);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("rejects conflicting artifact hash at boundary", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "artifact_revision_hash_conflict" },
    });
    await expect(
      workerPutRunArtifact({ rpc }, {
        studyRunId: "run-1",
        artifactKind: "gate1-smoke@1",
        contractVersion: "run-artifact@1",
        contentSha256: "different-hash",
        payloadJson: { step: "other" },
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect((err as StudyRunPersistenceError).boundary?.error_code).toBe(
        "INVALID_REQUEST",
      );
      return true;
    });
  });
});
