import { describe, expect, it } from "vitest";

import { buildAnalyzeSubmitBody, nextDeliveryKey, resolveDisplayedIntent, shouldEnqueueStudyRun } from "./handoff";

describe("shouldEnqueueStudyRun", () => {
  it("queues a new submit and a replay that is still queued", () => {
    expect(shouldEnqueueStudyRun(false, "QUEUED")).toBe(true);
    expect(shouldEnqueueStudyRun(true, "QUEUED")).toBe(true);
    expect(shouldEnqueueStudyRun(true, "RUNNING")).toBe(true);
  });

  it("does not requeue a finished run", () => {
    expect(shouldEnqueueStudyRun(true, "SUCCEEDED")).toBe(false);
    expect(shouldEnqueueStudyRun(true, "FAILED")).toBe(false);
    expect(shouldEnqueueStudyRun(true, "CANCELLED")).toBe(false);
  });
});

describe("resolveDisplayedIntent", () => {
  it("keeps the first-page question when no run exists", () => {
    const shown = resolveDisplayedIntent({
      local: { rawIntent: "What changed since the last plan?", selectedDomainId: "iep" },
      server: null,
    });
    expect(shown.rawIntent).toBe("What changed since the last plan?");
    expect(shown.selectedDomainId).toBe("iep");
    expect(shown.locked).toBe(false);
  });

  it("shows the stored intent while a run is active", () => {
    const shown = resolveDisplayedIntent({
      local: { rawIntent: "edited but not submitted", selectedDomainId: null },
      server: {
        intentRequestText: "What changed since the last plan?",
        domainHint: "iep",
        runStatus: "RUNNING",
      },
    });
    expect(shown.rawIntent).toBe("What changed since the last plan?");
    expect(shown.selectedDomainId).toBe("iep");
    expect(shown.locked).toBe(true);
  });

  it("restores a submitted question after refresh when the browser draft is gone", () => {
    const shown = resolveDisplayedIntent({
      local: null,
      server: {
        intentRequestText: "List the services and amounts.",
        domainHint: null,
        runStatus: "SUCCEEDED",
      },
    });
    expect(shown.rawIntent).toBe("List the services and amounts.");
    expect(shown.selectedDomainId).toBeNull();
    expect(shown.locked).toBe(false);
  });
});

describe("buildAnalyzeSubmitBody", () => {
  it("passes the hive question unchanged and omits a domain when none was chosen", () => {
    const body = buildAnalyzeSubmitBody({
      requestText: "  List the services and amounts. ",
      domainId: null,
      idempotencyKey: "key-1",
    });
    expect(body.request_text).toBe("List the services and amounts.");
    expect(body.trigger).toBe("study");
    expect(body.idempotency_key).toBe("key-1");
    expect(body.clarification_json).toBeNull();
  });

  it("sends the selected domain as a hint", () => {
    const body = buildAnalyzeSubmitBody({
      requestText: "What changed since the last plan?",
      domainId: "iep",
      idempotencyKey: "key-2",
    });
    expect(body.clarification_json).toEqual({ domain_hint: "iep" });
  });
});

describe("nextDeliveryKey", () => {
  it("reuses the key for the same question after a queue failure and mints a new key after an edit", () => {
    const first = nextDeliveryKey({
      previous: null,
      signature: "iep\nQuestion",
      reusePrevious: false,
      createKey: () => "key-a",
    });
    const retry = nextDeliveryKey({
      previous: first,
      signature: "iep\nQuestion",
      reusePrevious: true,
      createKey: () => "key-b",
    });
    const edited = nextDeliveryKey({
      previous: first,
      signature: "iep\nQuestion edited",
      reusePrevious: true,
      createKey: () => "key-c",
    });
    expect(retry.key).toBe("key-a");
    expect(edited.key).toBe("key-c");
  });
});
