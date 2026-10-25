"use client";

import type { PackExtractionOwnerFactV1 } from "@hiveforyou/contracts/pack-extraction/v1";
import { useCallback, useEffect, useState } from "react";

import {
  groupExtractionByDocument,
  type ExtractedDocumentView,
} from "@/lib/study-runs/analysis-view";
import { fetchStudyRunExtraction, StudyRunApiError } from "@/lib/study-runs/client";

export { groupExtractionByDocument, type ExtractedDocumentView };

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

const STATUS_LABEL: Record<ExtractedDocumentView["status"], string> = {
  extracted: "Extracted",
  extracted_with_rejections: "Extracted, some candidates rejected",
  unrecognized: "Not a recognized document type",
  failed: "Extraction failed",
};

const FACT_STATUS_LABEL: Record<PackExtractionOwnerFactV1["status"], string> = {
  OBSERVED: "Observed",
  NOT_FOUND: "Not found",
  NOT_APPLICABLE: "Not applicable",
  UNCERTAIN: "Uncertain",
};

export function ExtractedFactsView({ documents }: { documents: ExtractedDocumentView[] }) {
  return (
    <div className="mt-6" data-testid="extracted-facts">
      <p className="m-0 text-sm font-semibold text-[#1F2328]">Extracted facts (unverified)</p>
      <p className="mt-1 text-xs text-[#4A525C]">
        Candidate facts with the page and quote they were read from. They are not verified findings.
      </p>
      <ul className="mt-3 mb-0 list-none space-y-4 p-0">
        {documents.map((doc) => (
          <li
            key={doc.source_document_id}
            className="rounded-[12px] border border-[#E7E9ED] p-4"
            data-testid="extracted-document"
            data-status={doc.status}
          >
            <p className="m-0 text-sm font-semibold text-[#1F2328]">{doc.filename}</p>
            <p className="mt-1 text-xs text-[#4A525C]">
              <span data-testid="document-type">{doc.document_type_id ?? "Unclassified"}</span>
              {" · "}
              {doc.pages}
              {" · "}
              <span data-testid="validation-status">{STATUS_LABEL[doc.status]}</span>
            </p>
            {doc.rejection_reason_codes.length > 0 ? (
              <p className="mt-1 text-xs text-[#8A5A00]" data-testid="rejection-codes">
                Rejected candidates: {doc.rejection_reason_codes.join(", ")}
              </p>
            ) : null}
            {doc.status === "failed" && doc.error_reason ? (
              <p className="mt-1 text-xs text-[#B42318]">Reason: {doc.error_reason}</p>
            ) : null}
            {doc.facts.length > 0 ? (
              <ul className="mt-3 mb-0 list-none space-y-2 p-0">
                {doc.facts.map((fact, index) => (
                  <li key={`${fact.record_local_id}-${fact.fact_id}-${index}`} data-testid="extracted-fact">
                    <p className="m-0 text-sm text-[#1F2328]">
                      <span className="font-mono text-xs">{fact.fact_id}</span>
                      {fact.status === "OBSERVED" || fact.status === "UNCERTAIN" ? (
                        <>: {formatValue(fact.value)}</>
                      ) : null}
                      <span className="ml-2 text-xs text-[#4A525C]">{FACT_STATUS_LABEL[fact.status]}</span>
                    </p>
                    {fact.evidence.map((anchor, anchorIndex) => (
                      <p
                        key={anchorIndex}
                        className="m-0 mt-1 text-xs text-[#4A525C]"
                        data-testid="fact-citation"
                      >
                        p. {anchor.page_number}: “{anchor.exact_quote}”
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Loads persisted Pack extraction for a finished run; renders nothing when the run has none. */
export function ExtractedFactsPanel({ hiveId, studyRunId }: { hiveId: string; studyRunId: string }) {
  const [documents, setDocuments] = useState<ExtractedDocumentView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const view = await fetchStudyRunExtraction(hiveId, studyRunId);
      setDocuments(groupExtractionByDocument(view));
    } catch (err) {
      setDocuments(null);
      setError(err instanceof StudyRunApiError ? err.message : "Could not load extracted facts.");
    }
  }, [hiveId, studyRunId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="mt-6 text-sm text-[#4A525C]" data-testid="extracted-facts-error">
        {error}{" "}
        <button type="button" className="font-semibold underline" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  }
  if (!documents || documents.length === 0) {
    return null;
  }
  return <ExtractedFactsView documents={documents} />;
}
