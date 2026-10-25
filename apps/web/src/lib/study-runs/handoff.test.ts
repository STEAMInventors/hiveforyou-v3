import { describe, expect, it } from "vitest";

import {
  buildAnalyzeSubmitBody,
  buildStudyProgressChecklist,
  capturedQuestionForAnalyze,
  classifyReadingArrival,
  continueAction,
  formatTimeSinceUpdate,
  isQuestionChanged,
  isReadingStageComplete,
  isStudyRunUpdateStale,
  latestActivityIso,
  mergeMonotonicReadingProgress,
  mergeMonotonicStageIndex,
  nextDeliveryKey,
  resolveDisplayedIntent,
  runDocumentCounts,
  shouldEnqueueStudyRun,
  STUDY_RUN_STALE_UPDATE_MS,
  studyDomainHintLabel,
  studyRunDocumentTotalLine,
  studyRunQuestionLine,
  studyRunReadingProgressLine,
  studyRunStageDetail,
  studyRunStaleNotice,
  studyRunStatusDecision,
  studyRunSummaryText,
} from "./handoff";

describe("living hive events (UX-DOC-1 Step 3)", () => {
  it("only a continuous, increasing observation with a prior count is an arrival", () => {
    expect(classifyReadingArrival({ previousFinished: null, nextFinished: 5, continuous: true })).toBeNull();
    expect(classifyReadingArrival({ previousFinished: 3, nextFinished: 3, continuous: true })).toBeNull();
    expect(classifyReadingArrival({ previousFinished: 3, nextFinished: 2, continuous: true })).toBeNull();
    expect(classifyReadingArrival({ previousFinished: 3, nextFinished: 4, continuous: false })).toBeNull();
    expect(classifyReadingArrival({ previousFinished: 0, nextFinished: 1, continuous: true })).toEqual({
      kind: "single",
      count: 1,
    });
    expect(classifyReadingArrival({ previousFinished: 3, nextFinished: 6, continuous: true })).toEqual({
      kind: "batch",
      count: 3,
    });
  });

  it("reading is complete only once the monotonic stage is past extract", () => {
    const index = (stage: string) => mergeMonotonicStageIndex(-1, stage);
    expect(isReadingStageComplete(-1)).toBe(false);
    expect(isReadingStageComplete(index("plan_schema"))).toBe(false);
    expect(isReadingStageComplete(index("extract"))).toBe(false);
    expect(isReadingStageComplete(index("finalize"))).toBe(true);
    expect(isReadingStageComplete(mergeMonotonicStageIndex(index("finalize"), "extract"))).toBe(true);
  });

  describe("status response ordering", () => {
    const running = { id: "run-1", status: "RUNNING" };
    const succeeded = { id: "run-1", status: "SUCCEEDED" };

    it("applies newer responses in order", () => {
      expect(studyRunStatusDecision({ requestSeq: 1, latestSettledSeq: 0, current: running, next: running })).toBe(
        "apply",
      );
      expect(
        studyRunStatusDecision({ requestSeq: 2, latestSettledSeq: 1, current: running, next: succeeded }),
      ).toBe("apply");
      expect(studyRunStatusDecision({ requestSeq: 1, latestSettledSeq: 0, current: null, next: running })).toBe(
        "apply",
      );
    });

    it("ignores a response older than the latest settled poll", () => {
      expect(
        studyRunStatusDecision({ requestSeq: 1, latestSettledSeq: 2, current: succeeded, next: running }),
      ).toBe("stale");
      expect(studyRunStatusDecision({ requestSeq: 2, latestSettledSeq: 2, current: running, next: running })).toBe(
        "stale",
      );
    });

    it("never moves a finished run back to active, even from a fresh response", () => {
      expect(
        studyRunStatusDecision({ requestSeq: 3, latestSettledSeq: 2, current: succeeded, next: running }),
      ).toBe("keep_current");
      expect(
        studyRunStatusDecision({
          requestSeq: 3,
          latestSettledSeq: 2,
          current: { id: "run-1", status: "FAILED" },
          next: { id: "run-1", status: "QUEUED" },
        }),
      ).toBe("keep_current");
    });

    it("keeps the watched run when a response belongs to another run", () => {
      expect(
        studyRunStatusDecision({
          requestSeq: 3,
          latestSettledSeq: 2,
          current: running,
          next: { id: "run-0", status: "RUNNING" },
        }),
      ).toBe("keep_current");
    });
  });
});

describe("live progress copy (UX-DOC-1 Step 3)", () => {
  const running = (stage: string) => ({ status: "RUNNING", stage });

  it("describes only active stages, never queued or terminal runs", () => {
    expect(studyRunStageDetail(running("extract"))).toContain("page by page");
    expect(studyRunStageDetail(running("plan_questions"))).toBeTruthy();
    expect(studyRunStageDetail({ status: "QUEUED", stage: "enqueue" })).toBeNull();
    expect(studyRunStageDetail({ status: "SUCCEEDED", stage: "finalize" })).toBeNull();
    expect(studyRunStageDetail({ status: "FAILED", stage: "extract" })).toBeNull();
    expect(studyRunStageDetail(running("verify"))).toBeNull();
    expect(studyRunStageDetail(null)).toBeNull();
  });

  it("shows the question count only after it is recorded", () => {
    expect(studyRunQuestionLine(running("plan_questions"), 3)).toBeNull();
    expect(studyRunQuestionLine(running("extract"), 1)).toBe("We'll look for answers to 1 question.");
    expect(studyRunQuestionLine(running("extract"), 0)).toBeNull();
    expect(studyRunQuestionLine(running("extract"), null)).toBeNull();
    expect(studyRunQuestionLine({ status: "SUCCEEDED", stage: "finalize" }, 3)).toBeNull();
  });

  it("reports finished documents only from markers, only during extract", () => {
    const counts = { documents_total: 8, documents_finished: 3, documents_unusable: 0 };
    expect(studyRunReadingProgressLine(running("extract"), counts)).toBe("Finished reading 3 of 8 documents.");
    expect(
      studyRunReadingProgressLine(running("extract"), { ...counts, documents_finished: 1, documents_total: 1 }),
    ).toBe("Finished reading 1 of 1 document.");
    expect(studyRunReadingProgressLine(running("extract"), { ...counts, documents_total: null })).toBe(
      "Finished reading 3 documents.",
    );
    expect(studyRunReadingProgressLine(running("extract"), { ...counts, documents_unusable: 1 })).toBe(
      "Finished reading 3 of 8 documents. 1 couldn't be read.",
    );
    expect(studyRunReadingProgressLine(running("extract"), { ...counts, documents_finished: 0 })).toBeNull();
    expect(studyRunReadingProgressLine(running("plan_schema"), counts)).toBeNull();
    expect(studyRunReadingProgressLine({ status: "SUCCEEDED", stage: "extract" }, counts)).toBeNull();
    expect(studyRunReadingProgressLine(running("extract"), null)).toBeNull();
  });

  it("never moves the finished count backward", () => {
    const a = { documents_total: 8, documents_finished: 4, documents_unusable: 0 };
    const b = { documents_total: 8, documents_finished: 2, documents_unusable: 0 };
    expect(mergeMonotonicReadingProgress(null, b)).toBe(b);
    expect(mergeMonotonicReadingProgress(a, b)).toBe(a);
    expect(mergeMonotonicReadingProgress(b, a)).toBe(a);
  });

  it("uses extract-specific stale copy", () => {
    expect(studyRunStaleNotice("extract")).toContain("several minutes per document");
    expect(studyRunStaleNotice("plan_schema")).not.toContain("per document");
  });

  it("treats a newly observed finished document as the latest activity", () => {
    const updated = "2026-10-25T10:00:00.000Z";
    expect(latestActivityIso(updated, null)).toBe(updated);
    expect(latestActivityIso(updated, Date.parse("2026-10-25T09:00:00.000Z"))).toBe(updated);
    expect(latestActivityIso(updated, Date.parse("2026-10-25T10:05:00.000Z"))).toBe("2026-10-25T10:05:00.000Z");
    expect(latestActivityIso(null, Date.parse("2026-10-25T10:05:00.000Z"))).toBe("2026-10-25T10:05:00.000Z");
  });
});

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
    expect(studyRunSummaryText({ status: "RUNNING", stage: "plan_schema" }, 8)).toBe(
      "Identifying types in your 8 documents…",
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

describe("study progress helpers", () => {
  it("merges stage indices monotonically across retries", () => {
    let max = mergeMonotonicStageIndex(-1, "plan_schema");
    expect(max).toBe(3);
    max = mergeMonotonicStageIndex(max, "load_sources");
    expect(max).toBe(3);
    max = mergeMonotonicStageIndex(max, "extract");
    expect(max).toBe(4);
  });

  it("keeps checklist progress when the server reports an earlier stage", () => {
    const checklist = buildStudyProgressChecklist(4, { status: "RUNNING", stage: "plan_schema" });
    const extractRow = checklist.find((row) => row.label === "Reading your documents");
    expect(extractRow?.state).toBe("active");
  });

  it("detects stale durable updates", () => {
    const now = Date.parse("2026-10-24T12:00:00.000Z");
    const fresh = new Date(now - STUDY_RUN_STALE_UPDATE_MS + 60_000).toISOString();
    const stale = new Date(now - STUDY_RUN_STALE_UPDATE_MS - 1).toISOString();
    expect(isStudyRunUpdateStale(fresh, now)).toBe(false);
    expect(isStudyRunUpdateStale(stale, now)).toBe(true);
  });

  it("formats last-update copy for customers", () => {
    const now = Date.parse("2026-10-24T12:05:00.000Z");
    expect(formatTimeSinceUpdate("2026-10-24T12:04:50.000Z", now)).toBe("Last update just now");
    expect(formatTimeSinceUpdate("2026-10-24T12:03:00.000Z", now)).toBe("Last update 2 minutes ago");
  });

  it("shows document totals without completion counts", () => {
    expect(studyRunDocumentTotalLine(8)).toBe("8 documents in this analysis");
    expect(studyRunDocumentTotalLine(null)).toBeNull();
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
