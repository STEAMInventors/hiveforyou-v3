export type LandingDraftFile = {
  name: string;
  size: number;
};

export type LandingDraft = {
  draftId: string;
  rawIntent: string;
  selectedDomainId: string | null;
  files: LandingDraftFile[];
  /** Set once this draft has been attached to a created Hive. */
  hiveId?: string | null;
};

const STORAGE_KEY = "hive3-landing-draft-v1";

export function createLandingDraftId(): string {
  return crypto.randomUUID();
}

export function saveLandingDraft(draft: LandingDraft): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function readLandingDraft(): LandingDraft | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as LandingDraft;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.files)) {
      return null;
    }
    const draftId =
      typeof parsed.draftId === "string" && parsed.draftId.trim()
        ? parsed.draftId.trim()
        : createLandingDraftId();
    const hiveId =
      typeof parsed.hiveId === "string" && parsed.hiveId.trim() ? parsed.hiveId.trim() : null;
    const rawIntent = typeof parsed.rawIntent === "string" ? parsed.rawIntent : "";
    const selectedDomainId =
      typeof parsed.selectedDomainId === "string" && parsed.selectedDomainId.trim()
        ? parsed.selectedDomainId.trim()
        : null;
    return {
      draftId,
      rawIntent,
      selectedDomainId,
      files: parsed.files.filter(
        (file) => file && typeof file.name === "string" && typeof file.size === "number",
      ),
      hiveId,
    };
  } catch {
    return null;
  }
}

export function clearLandingDraft(): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.removeItem(STORAGE_KEY);
}

/** Drop staged filenames after upload starts. Question and domain stay on the draft. */
export function releaseLandingDraftFiles(): void {
  const draft = readLandingDraft();
  if (!draft) {
    return;
  }
  saveLandingDraft({ ...draft, files: [] });
}
