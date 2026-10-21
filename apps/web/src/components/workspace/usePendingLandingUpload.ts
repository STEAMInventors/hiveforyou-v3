"use client";

import { useEffect, useState } from "react";

import { clearDraftFiles, readDraftFiles } from "@/lib/landing/draft-file-blobs";
import { clearLandingDraft, readLandingDraft } from "@/lib/landing/draft-storage";

const PENDING_UPLOAD_KEY = "hive3-pending-upload-hive";

export function markHiveForPendingUpload(hiveId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.setItem(PENDING_UPLOAD_KEY, hiveId);
}

export function usePendingLandingUpload(hiveId: string): {
  pendingFiles: File[];
  clearPending: () => void;
} {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  useEffect(() => {
    const flaggedHive = sessionStorage.getItem(PENDING_UPLOAD_KEY);
    if (flaggedHive !== hiveId) {
      return;
    }
    const draft = readLandingDraft();
    if (!draft?.draftId) {
      sessionStorage.removeItem(PENDING_UPLOAD_KEY);
      return;
    }
    void (async () => {
      const files = await readDraftFiles(draft.draftId);
      if (files.length > 0) {
        setPendingFiles(files);
      }
    })();
  }, [hiveId]);

  const clearPending = () => {
    const draft = readLandingDraft();
    if (draft?.draftId) {
      void clearDraftFiles(draft.draftId);
    }
    clearLandingDraft();
    sessionStorage.removeItem(PENDING_UPLOAD_KEY);
    setPendingFiles([]);
  };

  return { pendingFiles, clearPending };
}
