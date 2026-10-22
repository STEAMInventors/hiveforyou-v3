import type { SourceDocumentV1 } from "@hiveforyou/contracts/documents/v1";

export type DocumentWorkspaceLists = {
  registeredDocuments: SourceDocumentV1[];
  inProgressDocuments: SourceDocumentV1[];
  failedAttempts: SourceDocumentV1[];
};

/** Split hive document list for workspace UI (registered count vs failed attempts). */
export function partitionDocumentWorkspaceLists(
  documents: SourceDocumentV1[],
): DocumentWorkspaceLists {
  const registeredDocuments: SourceDocumentV1[] = [];
  const inProgressDocuments: SourceDocumentV1[] = [];
  const failedAttempts: SourceDocumentV1[] = [];

  for (const doc of documents) {
    if (doc.status === "registered") {
      registeredDocuments.push(doc);
    } else if (doc.status === "pending") {
      inProgressDocuments.push(doc);
    } else if (doc.status === "failed") {
      failedAttempts.push(doc);
    }
  }

  return { registeredDocuments, inProgressDocuments, failedAttempts };
}

export function registeredDocumentCount(documents: SourceDocumentV1[]): number {
  return partitionDocumentWorkspaceLists(documents).registeredDocuments.length;
}
