import { readLandingDraft, saveLandingDraft } from "@/lib/landing/draft-storage";

export type HiveIntentDraft = {
  hiveId: string;
  rawIntent: string;
  selectedDomainId: string | null;
};

const STORAGE_KEY = "hive3-hive-intent-v1";
const MAX_HIVES = 20;

type HiveIntentStore = Record<string, { rawIntent: string; selectedDomainId: string | null }>;

function readStore(): HiveIntentStore {
  if (typeof window === "undefined") {
    return {};
  }
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as HiveIntentStore;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function writeStore(store: HiveIntentStore): void {
  if (typeof window === "undefined") {
    return;
  }
  const entries = Object.entries(store).slice(-MAX_HIVES);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
}

export function readHiveIntentDraft(hiveId: string): HiveIntentDraft | null {
  const store = readStore();
  if (!Object.prototype.hasOwnProperty.call(store, hiveId)) {
    return null;
  }
  const entry = store[hiveId];
  if (!entry || typeof entry !== "object") {
    return { hiveId, rawIntent: "", selectedDomainId: null };
  }
  const rawIntent = typeof entry.rawIntent === "string" ? entry.rawIntent : "";
  const selectedDomainId =
    typeof entry.selectedDomainId === "string" && entry.selectedDomainId.trim()
      ? entry.selectedDomainId.trim()
      : null;
  return { hiveId, rawIntent, selectedDomainId };
}

export function saveHiveIntentDraft(draft: HiveIntentDraft): void {
  const store = readStore();
  delete store[draft.hiveId];
  store[draft.hiveId] = {
    rawIntent: draft.rawIntent,
    selectedDomainId: draft.selectedDomainId,
  };
  writeStore(store);
}

/**
 * Attach an unbound landing draft to this Hive.
 * A draft already bound to a different Hive is left alone.
 */
export function bindLandingDraftToHive(hiveId: string): HiveIntentDraft | null {
  const landing = readLandingDraft();
  if (!landing) {
    return readHiveIntentDraft(hiveId);
  }
  if (landing.hiveId && landing.hiveId !== hiveId) {
    return readHiveIntentDraft(hiveId);
  }
  const next: HiveIntentDraft = {
    hiveId,
    rawIntent: landing.rawIntent,
    selectedDomainId: landing.selectedDomainId,
  };
  saveLandingDraft({ ...landing, hiveId });
  if (next.rawIntent.trim() || next.selectedDomainId) {
    saveHiveIntentDraft(next);
  }
  return next.rawIntent.trim() || next.selectedDomainId ? next : readHiveIntentDraft(hiveId);
}

/** Question and domain for this Hive: saved edits first, then an unbound or matching landing draft. */
export function adoptLandingIntentForHive(hiveId: string): HiveIntentDraft | null {
  const existing = readHiveIntentDraft(hiveId);
  if (existing) {
    return existing;
  }
  const landing = readLandingDraft();
  if (!landing) {
    return null;
  }
  if (landing.hiveId && landing.hiveId !== hiveId) {
    return null;
  }
  return bindLandingDraftToHive(hiveId);
}
