export type LandingDraftFile = {
  name: string;
  size: number;
};

export type LandingDraft = {
  rawIntent: string;
  selectedDomainId: string | null;
  files: LandingDraftFile[];
};

const STORAGE_KEY = "hive3-landing-draft-v1";

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
    return parsed;
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
