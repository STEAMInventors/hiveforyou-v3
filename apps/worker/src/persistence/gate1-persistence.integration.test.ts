import { createClient } from "@supabase/supabase-js";
import {
  GATE1_SMOKE_ARTIFACT_KIND,
  RUN_ARTIFACT_CONTRACT_VERSION,
} from "@hiveforyou/contracts/study-runs/v1";
import { StudyRunStage, StudyRunStatus } from "@hiveforyou/contracts/errors/v1";
import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  enqueueStudyRun,
  getIntent,
  getStudyRun,
  insertIntent,
  type StudyRunPersistenceClient,
  workerGetRunArtifact,
  workerPutRunArtifact,
  workerTransitionStudyRun,
} from "./study-run-persistence.js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ownerEmail = process.env.GATE1_TEST_OWNER_EMAIL;
const ownerPassword = process.env.GATE1_TEST_OWNER_PASSWORD;
const otherEmail = process.env.GATE1_TEST_OTHER_EMAIL;
const otherPassword = process.env.GATE1_TEST_OTHER_PASSWORD;

const integrationReady =
  Boolean(url && anonKey && serviceKey && ownerEmail && ownerPassword);

async function signIn(email: string, password: string) {
  const client = createClient(url!, anonKey!);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw error ?? new Error("sign-in failed");
  }
  return createClient(url!, anonKey!, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

async function createHive(userClient: StudyRunPersistenceClient) {
  const clientRequestId = randomUUID();
  const { data, error } = await userClient.rpc("hive3_m1_insert_hive", {
    p_name: "Gate1 test hive",
    p_description: null,
    p_client_request_id: clientRequestId,
  });
  if (error) {
    throw error;
  }
  const hive = data as { id: string };
  return hive.id;
}

describe.skipIf(!integrationReady)("Gate 1 persistence integration", () => {
  it("intent → run → immutable artifact → retry → failure → cross-hive deny", async () => {
    const owner = await signIn(ownerEmail!, ownerPassword!);
    const service = createClient(url!, serviceKey!);
    const ownerPersistence = owner as unknown as StudyRunPersistenceClient;
    const servicePersistence = service as unknown as StudyRunPersistenceClient;
    const hiveId = await createHive(ownerPersistence);

    const intent = await insertIntent(ownerPersistence, {
      hiveId,
      requestText: "Compare organic vs conventional totals across these receipts.",
    });
    const reloadedIntent = await getIntent(ownerPersistence, intent.intent_id);
    expect(reloadedIntent.request_text).toBe(
      "Compare organic vs conventional totals across these receipts.",
    );

    const deliveryKey = `gate1-${randomUUID()}`;
    const correlationId = randomUUID();
    const run1 = await enqueueStudyRun(ownerPersistence, {
      hiveId,
      intentId: intent.intent_id,
      trigger: "study",
      correlationId,
      idempotencyKey: deliveryKey,
      requestJson: { scope: "full_study" },
    });
    const runDup = await enqueueStudyRun(ownerPersistence, {
      hiveId,
      intentId: intent.intent_id,
      trigger: "study",
      correlationId,
      idempotencyKey: deliveryKey,
    });
    expect(runDup.id).toBe(run1.id);

    const payload = { gate: 1, note: "smoke artifact" };
    const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const artifact1 = await workerPutRunArtifact(servicePersistence, {
      studyRunId: run1.id,
      artifactKind: GATE1_SMOKE_ARTIFACT_KIND,
      contractVersion: RUN_ARTIFACT_CONTRACT_VERSION,
      contentSha256: hash,
      payloadJson: payload,
    });
    const artifact2 = await workerPutRunArtifact(servicePersistence, {
      studyRunId: run1.id,
      artifactKind: GATE1_SMOKE_ARTIFACT_KIND,
      contractVersion: RUN_ARTIFACT_CONTRACT_VERSION,
      contentSha256: hash,
      payloadJson: payload,
    });
    expect(artifact2.id).toBe(artifact1.id);

    const reloaded = await workerGetRunArtifact(servicePersistence, {
      studyRunId: run1.id,
      artifactKind: GATE1_SMOKE_ARTIFACT_KIND,
    });
    expect(reloaded.payload_jsonb).toEqual(payload);
    expect(reloaded.hive_id).toBe(hiveId);

    await expect(
      workerPutRunArtifact(servicePersistence, {
        studyRunId: run1.id,
        artifactKind: GATE1_SMOKE_ARTIFACT_KIND,
        contractVersion: RUN_ARTIFACT_CONTRACT_VERSION,
        contentSha256: "deadbeef",
        payloadJson: { gate: 1, note: "conflict" },
      }),
    ).rejects.toThrow(/artifact_revision_hash_conflict/);

    await workerTransitionStudyRun(servicePersistence, {
      studyRunId: run1.id,
      status: StudyRunStatus.RUNNING,
      stage: StudyRunStage.LOAD_SOURCES,
    });
    const failed = await workerTransitionStudyRun(servicePersistence, {
      studyRunId: run1.id,
      status: StudyRunStatus.FAILED,
      stage: StudyRunStage.EXTRACT,
      errorCode: "EXTRACTION_FAILED",
      errorMessageSafe: "We could not read one of your documents. Try again or replace the file.",
    });
    expect(failed.error_code).toBe("EXTRACTION_FAILED");
    expect(failed.error_message_safe).toContain("could not read");

    const ownerView = await getStudyRun(ownerPersistence, run1.id);
    expect(ownerView.status).toBe("FAILED");

    if (otherEmail && otherPassword) {
      const other = await signIn(otherEmail, otherPassword);
      const otherPersistence = other as unknown as StudyRunPersistenceClient;
      await expect(getStudyRun(otherPersistence, run1.id)).rejects.toThrow(/access_denied/);

      const otherHive = await createHive(otherPersistence);
      await expect(
        enqueueStudyRun(otherPersistence, {
          hiveId: otherHive,
          intentId: null,
          trigger: "generate",
          correlationId: randomUUID(),
          idempotencyKey: deliveryKey,
        }),
      ).rejects.toThrow(/idempotency_hive_mismatch/);
    }
  });
});
