// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  documentUploadStatusLabel,
  documentUploadUiStatus,
} from "./document-upload-status";

describe("document upload ui status", () => {
  it("maps only genuine upload states", () => {
    expect(documentUploadUiStatus("pending")).toBe("uploading");
    expect(documentUploadUiStatus("registered")).toBe("uploaded");
    expect(documentUploadUiStatus("failed")).toBe("upload_failed");
    expect(documentUploadUiStatus("abandoned")).toBeNull();
  });

  it("labels upload states for display", () => {
    expect(documentUploadStatusLabel("uploading")).toBe("Uploading");
    expect(documentUploadStatusLabel("uploaded")).toBe("Uploaded");
    expect(documentUploadStatusLabel("upload_failed")).toBe("Upload failed");
  });
});
