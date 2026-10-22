/** Domain is not persisted on Hive create in M1; do not infer from filenames. */
export const HIVE_DOMAIN_UNKNOWN_LABEL = "Not identified yet." as const;

export function formatRegisteredDocumentCount(count: number | undefined): string | null {
  if (count === undefined || !Number.isFinite(count) || count < 0) {
    return null;
  }
  if (count === 1) {
    return "1 document";
  }
  return `${count} documents`;
}

export function formatHiveFilenamePreview(
  registeredCount: number | undefined,
  previewFilenames: string[] | undefined,
): string | null {
  if (registeredCount === undefined || previewFilenames === undefined) {
    return null;
  }
  if (registeredCount <= 0 || previewFilenames.length === 0) {
    return null;
  }
  const shown = previewFilenames.slice(0, 3);
  const remainder = registeredCount - shown.length;
  const names = shown.join(", ");
  if (remainder > 0) {
    return `${names}, +${remainder} more`;
  }
  return names;
}
