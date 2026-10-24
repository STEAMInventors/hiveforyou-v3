import { describe, expect, it } from "vitest";

import {
  buildAnalyzeSubmitBody,
  capturedQuestionForAnalyze,
  continueAction,
  isQuestionChanged,
  nextDeliveryKey,
  resolveDisplayedIntent,
  runDocumentCounts,
  shouldEnqueueStudyRun,
  studyDomainHintLabel,
  studyRunSummaryText,
} from "./handoff";

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

describe("capturedQuestionForAnalyze", () => {
  it("returns the original question and rejects a blank substitute", () => {
    expect(capturedQuestionForAnalyze("  What changed since the last plan?  ")).toBe(
      "What changed since the last plan?",
    );
    expect(capturedQuestionForAnalyze("")).toBeNull();
    expect(capturedQuestionForAnalyze("   ")).toBeNull();
    expect(capturedQuestionForAnalyze(null)).toBeNull();
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

describe("studyDomainHintLabel", () => {
  it("shows no domain when unset and resolves known ids", () => {
    expect(studyDomainHintLabel(null, () => undefined)).toBe("No domain");
    expect(studyDomainHintLabel("iep", () => "Special Education / IEP")).toBe(
      "Special Education / IEP",
    );
    expect(studyDomainHintLabel("custom", () => undefined)).toBe("custom");
  });
});

describe("continueAction", () => {
  const ready = {
    requestText: "What changed?",
    questionChanged: false,
    newDocumentCount: 0,
    readyDocumentCount: 8,
    uploadingCount: 0,
    busy: false,
  };

  it("starts an analysis when no run exists", () => {
    expect(continueAction({ ...ready, runStatus: null })).toEqual({ kind: "start" });
  });

  it("opens progress for an active run and never submits", () => {
    expect(continueAction({ ...ready, runStatus: "QUEUED" })).toEqual({ kind: "view_progress" });
    expect(continueAction({ ...ready, runStatus: "RUNNING" })).toEqual({ kind: "view_progress" });
    expect(
      continueAction({ ...ready, runStatus: "RUNNING", questionChanged: true, newDocumentCount: 2 }),
    ).toEqual({ kind: "view_progress" });
  });

  it("shows results after success without offering a rerun when nothing changed", () => {
    expect(continueAction({ ...ready, runStatus: "SUCCEEDED" })).toEqual({
      kind: "view_results",
      canAnalyzeChanges: false,
    });
  });

  it("offers a new analysis after success only when the question or documents changed", () => {
    expect(continueAction({ ...ready, runStatus: "SUCCEEDED", questionChanged: true })).toEqual({
      kind: "view_results",
      canAnalyzeChanges: true,
    });
    expect(continueAction({ ...ready, runStatus: "SUCCEEDED", newDocumentCount: 1 })).toEqual({
      kind: "view_results",
      canAnalyzeChanges: true,
    });
    expect(
      continueAction({
        ...ready,
        runStatus: "SUCCEEDED",
        newDocumentCount: 1,
        uploadingCount: 1,
      }),
    ).toEqual({ kind: "view_results", canAnalyzeChanges: false });
    expect(
      continueAction({ ...ready, runStatus: "SUCCEEDED", questionChanged: true, requestText: "  " }),
    ).toEqual({ kind: "view_results", canAnalyzeChanges: false });
  });

  it("offers retry after a failed or cancelled run", () => {
    expect(continueAction({ ...ready, runStatus: "FAILED" })).toEqual({ kind: "retry" });
    expect(continueAction({ ...ready, runStatus: "CANCELLED" })).toEqual({ kind: "retry" });
  });

  it("disables with a reason when prerequisites are missing", () => {
    expect(continueAction({ ...ready, runStatus: null, requestText: "   " })).toEqual({
      kind: "disabled",
      reason: "Add your question to continue.",
    });
    expect(continueAction({ ...ready, runStatus: null, uploadingCount: 1 })).toEqual({
      kind: "disabled",
      reason: "Wait for uploads to finish.",
    });
    expect(continueAction({ ...ready, runStatus: "FAILED", readyDocumentCount: 0 })).toEqual({
      kind: "disabled",
      reason: "Add at least one document to continue.",
    });
    expect(continueAction({ ...ready, runStatus: null, busy: true }).kind).toBe("disabled");
  });
});

describe("isQuestionChanged", () => {
  it("ignores whitespace and detects text or domain edits", () => {
    const base = { requestText: "What changed?", domainId: "iep", lastDomainId: "iep" };
    expect(isQuestionChanged({ ...base, lastRequestText: "  What changed? " })).toBe(false);
    expect(isQuestionChanged({ ...base, lastRequestText: "Something else" })).toBe(true);
    expect(
      isQuestionChanged({ ...base, lastRequestText: "What changed?", lastDomainId: null }),
    ).toBe(true);
    expect(isQuestionChanged({ ...base, lastRequestText: null })).toBe(false);
  });
});

describe("runDocumentCounts", () => {
  it("counts registered documents before the run and those added after it", () => {
    const docs = [
      { status: "registered", registered_at: "2026-10-23T10:00:00Z" },
      { status: "registered", registered_at: "2026-10-23T11:00:00Z" },
      { status: "registered", registered_at: "2026-10-23T13:00:00Z" },
      { status: "pending", registered_at: null },
      { status: "failed", registered_at: null },
    ];
    expect(runDocumentCounts(docs, "2026-10-23T12:00:00Z")).toEqual({ included: 2, addedSince: 1 });
    expect(runDocumentCounts(docs, null)).toEqual({ included: 3, addedSince: 0 });
  });
});

describe("studyRunSummaryText", () => {
  it("describes progress without technical identifiers", () => {
    expect(studyRunSummaryText(null, 8)).toBeNull();
    expect(studyRunSummaryText({ status: "QUEUED", stage: "enqueue" }, 8)).toBe("Getting started…");
    expect(studyRunSummaryText({ status: "RUNNING", stage: "extract" }, 8)).toBe(
      "Reading your 8 documents…",
    );
    expect(studyRunSummaryText({ status: "RUNNING", stage: "load_sources" }, 1)).toBe(
      "Gathering your 1 document…",
    );
    expect(studyRunSummaryText({ status: "RUNNING", stage: "merge_study" }, null)).toBe(
      "Working on your documents…",
    );
    expect(studyRunSummaryText({ status: "FAILED", stage: "finalize" }, 8)).toBe(
      "Your last analysis didn't finish.",
    );
  });

  it("never claims the study is built after a successful run", () => {
    const text = studyRunSummaryText({ status: "SUCCEEDED", stage: "finalize" }, 8) ?? "";
    expect(text).toBe("Analysis finished. We read your 8 documents.");
    expect(text.toLowerCase()).not.toContain("study");
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
