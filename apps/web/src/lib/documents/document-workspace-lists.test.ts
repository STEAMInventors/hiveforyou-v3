import { describe, expect, it } from "vitest";

import type { SourceDocumentV1 } from "@hiveforyou/contracts/documents/v1";

import {
  partitionDocumentWorkspaceLists,
  registeredDocumentCount,
} from "./document-workspace-lists";

function doc(status: SourceDocumentV1["status"], id: string): SourceDocumentV1 {
  return {
    id,
    hive_id: "hive-1",
    client_request_id: `req-${id}`,
    filename: `${id}.pdf`,
    mime_type: "application/pdf",
    byte_size: 100,
    sha256: null,
    status,
    created_at: "2026-10-01T00:00:00.000Z",
    registered_at: status === "registered" ? "2026-10-02T00:00:00.000Z" : null,
  };
}

describe("partitionDocumentWorkspaceLists", () => {
  it("counts only registered documents and separates failed attempts", () => {
    const lists = partitionDocumentWorkspaceLists([
      doc("registered", "a"),
      doc("failed", "b"),
      doc("pending", "c"),
      doc("registered", "d"),
      doc("abandoned", "e"),
    ]);

    expect(lists.registeredDocuments.map((row) => row.id)).toEqual(["a", "d"]);
    expect(lists.inProgressDocuments.map((row) => row.id)).toEqual(["c"]);
    expect(lists.failedAttempts.map((row) => row.id)).toEqual(["b"]);
    expect(registeredDocumentCount([doc("registered", "a"), doc("failed", "b")])).toBe(1);
  });
});
