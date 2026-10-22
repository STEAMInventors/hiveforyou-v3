export type ReplacementCompleteRpcRow = {
  superseded_storage_path?: unknown;
  replacement_committed?: unknown;
  replacement_cleanup_pending?: unknown;
  replayed?: unknown;
};

/** Never return the newly registered storage path for superseded cleanup. */
export function supersededStoragePathForCleanup(
  completeRow: ReplacementCompleteRpcRow,
  registeredStoragePath: string | null,
): string | null {
  const raw = completeRow.superseded_storage_path;
  if (typeof raw !== "string") {
    return null;
  }
  const path = raw.trim();
  if (!path) {
    return null;
  }
  const registered = registeredStoragePath?.trim() ?? "";
  if (registered && path === registered) {
    return null;
  }
  return path;
}

export type ReplacementStorageCleanupResult =
  | { ok: true }
  | { ok: false; error_code: "STORAGE_UNAVAILABLE"; message_safe: string; retryable: true };

export type ReplacementStorageDeps = {
  removeStorageObjects: (paths: string[]) => Promise<void>;
  verifyStorageObjectAbsent: (path: string) => Promise<boolean>;
};

export async function runReplacementStorageCleanup(
  supersededPath: string,
  deps: ReplacementStorageDeps,
): Promise<ReplacementStorageCleanupResult> {
  await deps.removeStorageObjects([supersededPath]);
  const absent = await deps.verifyStorageObjectAbsent(supersededPath);
  if (!absent) {
    return {
      ok: false,
      error_code: "STORAGE_UNAVAILABLE",
      message_safe: "We could not remove the previous file. Try again.",
      retryable: true,
    };
  }
  return { ok: true };
}
