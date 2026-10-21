"use client";

import { FileText, Upload } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { SourceDocumentV1, UploadQuotaV1 } from "@hiveforyou/contracts/documents/v1";

import { fetchHiveDocuments, fetchUploadQuota } from "@/lib/documents/client";
import { uploadDocumentBatch } from "@/lib/documents/upload-batch";
import {
  isFreeUploadQuotaExhausted,
  UPLOAD_QUOTA_OFFER_FOOTNOTE,
  UPLOAD_QUOTA_OFFER_HEADLINE,
} from "@/lib/documents/upload-quota-offer";
import { validateUploadFile } from "@/lib/documents/validation";
import { formatFileSize } from "@/lib/format-file-metadata";
import { ACCEPTED_UPLOAD_EXTENSIONS, ACCEPTED_UPLOAD_MIME } from "@/lib/upload-constants";
import { inferHfyDocKind } from "@/lib/brand/hfy-doc-kind";

type HiveDocumentsPanelProps = {
  hiveId: string;
  initialPendingFiles?: File[];
  onPendingFilesConsumed?: () => void;
};

export function HiveDocumentsPanel({
  hiveId,
  initialPendingFiles = [],
  onPendingFilesConsumed,
}: HiveDocumentsPanelProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<SourceDocumentV1[]>([]);
  const [quota, setQuota] = useState<UploadQuotaV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const pendingStarted = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [docs, quotaBody] = await Promise.all([fetchHiveDocuments(hiveId), fetchUploadQuota()]);
      setDocuments(docs.documents);
      setQuota(quotaBody.quota);
    } catch {
      setError("Could not load documents. Refresh to try again.");
    } finally {
      setLoading(false);
    }
  }, [hiveId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const quotaExhausted = isFreeUploadQuotaExhausted(quota);

  const runUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || uploadBusy || isFreeUploadQuotaExhausted(quota)) {
        return;
      }
      setUploadBusy(true);
      setUploadMessage(null);
      setError(null);
      const items = files.map((file) => ({
        file,
        client_request_id: crypto.randomUUID(),
      }));
      const result = await uploadDocumentBatch({
        hiveId,
        items,
        onProgress: (progress) => {
          if (progress.currentFilename) {
            setProgressLabel(
              `Uploading ${progress.currentFilename} (${progress.completed + 1} of ${progress.total})…`,
            );
          } else {
            setProgressLabel(null);
          }
        },
      });
      setUploadBusy(false);
      setProgressLabel(null);
      if (result.failed.length > 0 && result.succeeded.length === 0) {
        setError(result.failed[0]?.message ?? "Upload failed.");
      } else if (result.failed.length > 0) {
        setUploadMessage(
          `${result.succeeded.length} uploaded; ${result.failed.length} failed. You can retry the failed files.`,
        );
      } else {
        setUploadMessage(`${result.succeeded.length} document${result.succeeded.length === 1 ? "" : "s"} uploaded.`);
      }
      await refresh();
    },
    [hiveId, quota, refresh, uploadBusy],
  );

  useEffect(() => {
    if (pendingStarted.current || initialPendingFiles.length === 0 || loading) {
      return;
    }
    pendingStarted.current = true;
    void (async () => {
      if (!isFreeUploadQuotaExhausted(quota)) {
        await runUpload(initialPendingFiles);
      }
      onPendingFilesConsumed?.();
    })();
  }, [initialPendingFiles, loading, onPendingFilesConsumed, quota, runUpload]);

  const onFilesSelected = (fileList: FileList | null) => {
    if (!fileList || uploadBusy || quotaExhausted) {
      return;
    }
    const accepted: File[] = [];
    for (const file of Array.from(fileList)) {
      const validation = validateUploadFile(file);
      if (validation.ok) {
        accepted.push(file);
      }
    }
    if (accepted.length === 0) {
      setError("Only PDF, PNG, JPG, and DOCX files up to 25 MB are supported.");
      return;
    }
    void runUpload(accepted);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="m-0 text-xl font-semibold text-[#1F2328]">Your documents</h2>
          <p className="mt-2 text-[15px] text-[#4A525C]">
            Start by adding what you have. You can always add more later.
          </p>
        </div>
        {quota ? (
          <p className="m-0 rounded-full bg-[#F3F6FC] px-3 py-1.5 text-sm text-[#4A525C]">
            <span className="font-semibold text-[#1F2328]">{quota.remaining}</span> of {quota.limit}{" "}
            uploads left this month (UTC)
          </p>
        ) : null}
      </div>

      <div className="mt-6 flex min-h-[220px] flex-col items-center justify-center rounded-[18px] border-2 border-dashed border-[#C9CFD8] bg-[#FAFCFF] px-6 py-10 text-center">
        <Upload className="mb-3 h-8 w-8 text-[#2F6FE4]" aria-hidden />
        <p className="m-0 text-lg font-semibold text-[#1F2328]">Add documents</p>
        {quotaExhausted ? (
          <div
            id={`${inputId}-quota-offer`}
            className="mt-4 w-full max-w-md rounded-[10px] border border-[#D6E4FF] bg-[#EEF4FF] px-4 py-3 text-left"
            role="status"
            aria-live="polite"
          >
            <p className="m-0 text-base font-semibold text-[#1F3F86]">{UPLOAD_QUOTA_OFFER_HEADLINE}</p>
            <p className="m-0 mt-2 text-sm leading-relaxed text-[#4A525C]">{UPLOAD_QUOTA_OFFER_FOOTNOTE}</p>
          </div>
        ) : (
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-[#4A525C]">
            PDF, PNG, JPG, or DOCX — up to 25 MB each.
          </p>
        )}
        {quotaExhausted ? (
          <button
            type="button"
            className="mt-4 inline-flex cursor-default rounded-[10px] bg-[#2F6FE4] px-4 py-2 text-sm font-semibold text-white"
            aria-describedby={`${inputId}-quota-offer`}
          >
            Choose files
          </button>
        ) : (
          <>
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              className="sr-only"
              multiple
              accept={`${ACCEPTED_UPLOAD_MIME},${ACCEPTED_UPLOAD_EXTENSIONS}`}
              onChange={(event) => onFilesSelected(event.target.files)}
              disabled={uploadBusy}
            />
            <label
              htmlFor={inputId}
              className={
                uploadBusy
                  ? "mt-4 inline-flex cursor-not-allowed rounded-[10px] bg-[#ECECEC] px-4 py-2 text-sm font-semibold text-[#9AA0A6]"
                  : "mt-4 inline-flex cursor-pointer rounded-[10px] bg-[#2F6FE4] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2456B8]"
              }
            >
              Choose files
            </label>
          </>
        )}
        {progressLabel ? (
          <p className="mt-3 text-sm text-[#4A525C]" aria-live="polite">
            {progressLabel}
          </p>
        ) : null}
      </div>

      {uploadMessage ? (
        <p className="mt-4 text-sm text-[#1F6B3A]" role="status">
          {uploadMessage}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 text-sm text-[#B3261E]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-8">
        <h3 className="m-0 text-base font-semibold text-[#1F2328]">Uploaded files</h3>
        {loading ? (
          <p className="mt-3 text-sm text-[#4A525C]">Loading…</p>
        ) : documents.length === 0 ? (
          <p className="mt-3 text-sm text-[#4A525C]">No documents yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#E8EAEE] rounded-[12px] border border-[#E8EAEE] bg-white">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <FileText className="h-5 w-5 shrink-0 text-[#2F6FE4]" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate font-medium text-[#1F2328]">{doc.filename}</p>
                  <p className="m-0 text-xs text-[#6B7280]">
                    {inferHfyDocKind(doc.filename)} · {formatFileSize(doc.byte_size)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
