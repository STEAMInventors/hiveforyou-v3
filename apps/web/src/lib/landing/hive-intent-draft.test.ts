import { afterEach, describe, expect, it, vi } from "vitest";

import { saveLandingDraft } from "./draft-storage";
import { adoptLandingIntentForHive, bindLandingDraftToHive, readHiveIntentDraft, saveHiveIntentDraft } from "./hive-intent-draft";

function installSessionStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {});
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  });
  vi.stubGlobal("crypto", { randomUUID: () => "draft-1" });
}

describe("hive intent draft", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the first-page question after the draft is bound to a Hive", () => {
    installSessionStorage();
    saveLandingDraft({
      draftId: "draft-1",
      rawIntent: "What changed since the last plan?",
      selectedDomainId: "iep",
      files: [{ name: "iep.pdf", size: 10 }],
    });
    const bound = bindLandingDraftToHive("hive-1");
    expect(bound?.rawIntent).toBe("What changed since the last plan?");
    expect(bound?.selectedDomainId).toBe("iep");
    expect(readHiveIntentDraft("hive-1")?.rawIntent).toBe("What changed since the last plan?");
  });

  it("does not copy one Hive's question onto a different Hive", () => {
    installSessionStorage();
    saveLandingDraft({
      draftId: "draft-1",
      rawIntent: "What changed since the last plan?",
      selectedDomainId: "iep",
      files: [],
      hiveId: "hive-1",
    });
    saveHiveIntentDraft({
      hiveId: "hive-1",
      rawIntent: "What changed since the last plan?",
      selectedDomainId: "iep",
    });
    expect(bindLandingDraftToHive("hive-2")).toBeNull();
    expect(adoptLandingIntentForHive("hive-2")).toBeNull();
    expect(readHiveIntentDraft("hive-1")?.rawIntent).toContain("last plan");
  });

  it("keeps an edited question instead of restoring the original landing text", () => {
    installSessionStorage();
    saveLandingDraft({
      draftId: "draft-1",
      rawIntent: "Original question",
      selectedDomainId: null,
      files: [],
      hiveId: "hive-1",
    });
    saveHiveIntentDraft({
      hiveId: "hive-1",
      rawIntent: "Edited question",
      selectedDomainId: null,
    });
    expect(adoptLandingIntentForHive("hive-1")?.rawIntent).toBe("Edited question");
  });
});
