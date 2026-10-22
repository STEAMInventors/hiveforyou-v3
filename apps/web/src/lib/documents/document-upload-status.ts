import type { SourceDocumentV1 } from "@hiveforyou/contracts/documents/v1";

export type DocumentUploadUiStatus = "uploading" | "uploaded" | "upload_failed";

export function documentUploadUiStatus(
  status: SourceDocumentV1["status"],
): DocumentUploadUiStatus | null {
  if (status === "pending") {
    return "uploading";
  }
  if (status === "registered") {
    return "uploaded";
  }
  if (status === "failed") {
    return "upload_failed";
  }
  return null;
}

export function documentUploadStatusLabel(uiStatus: DocumentUploadUiStatus): string {
  if (uiStatus === "uploading") {
    return "Uploading";
  }
  if (uiStatus === "uploaded") {
    return "Uploaded";
  }
  return "Upload failed";
}

export function formatDocumentUploadDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
