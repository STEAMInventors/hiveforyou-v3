"use client";

import { FileText, Plus, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import type {
  SourceDocumentV1,
  UploadProductPolicyV1,
  UploadQuotaV1,
} from "@hiveforyou/contracts/documents/v1";

import { DeleteDocumentModal } from "@/components/workspace/DeleteDocumentModal";
import { hfyDocKindLabel, inferHfyDocKind } from "@/lib/brand/hfy-doc-kind";
import {
  deleteRegisteredDocumentUpload,
  dismissFailedDocumentUpload,
  fetchHiveDocuments,
  fetchUploadQuota,
} from "@/lib/documents/client";
import { partitionDocumentWorkspaceLists } from "@/lib/documents/document-workspace-lists";
import {
  documentUploadStatusLabel,
  documentUploadUiStatus,
  formatDocumentUploadDate,
} from "@/lib/documents/document-upload-status";
import { replaceRegisteredDocument, uploadDocumentBatch } from "@/lib/documents/upload-batch";
import {
  buildUploadAcceptAttribute,
  uploadTypeGuidanceLabel,
  uploadValidationErrorLabel,
} from "@/lib/documents/upload-policy";
import {
  commercialOfferFootnote,
  formatCommercialOfferHeadline,
  isFreeUploadQuotaExhausted,
} from "@/lib/documents/upload-quota-offer";
import { validateUploadFile } from "@/lib/documents/validation";
import { formatFileSize } from "@/lib/format-file-metadata";

export type HiveDocumentsSnapshot = {
  documents: SourceDocumentV1[];
  uploadBusy: boolean;
};

type HiveDocumentsPanelProps = {
  hiveId: string;
  initialPendingFiles?: File[];
  onPendingFilesConsumed?: () => void;
  onSnapshotChange?: (snapshot: HiveDocumentsSnapshot) => void;
};

function statusBadgeClass(uiStatus: "uploading" | "uploaded" | "upload_failed"): string {
  if (uiStatus === "uploading") {
    return "bg-[#FEF5E1] text-[#875700]";
  }
  if (uiStatus === "uploaded") {
    return "bg-[#EAF6EE] text-[#1E7A41]";
  }
  return "bg-[#FDEDEB] text-[#B4352A]";
}

export function HiveDocumentsPanel({
  hiveId,
  initialPendingFiles = [],
  onPendingFilesConsumed,
  onSnapshotChange,
}: HiveDocumentsPanelProps) {
  const inputId = useId();
  const retryInputId = useId();
  const replaceInputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const retryInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const retryClientRequestIdRef = useRef<string | null>(null);
  const replaceTargetDocumentIdRef = useRef<string | null>(null);
  const [documents, setDocuments] = useState<SourceDocumentV1[]>([]);
  const [quota, setQuota] = useState<UploadQuotaV1 | null>(null);
  const [policy, setPolicy] = useState<UploadProductPolicyV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [dismissBusyId, setDismissBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SourceDocumentV1 | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const pendingStarted = useRef(false);

  const { registeredDocuments, inProgressDocuments, failedAttempts } =
    partitionDocumentWorkspaceLists(documents);
  const workspaceDocuments = [...registeredDocuments, ...inProgressDocuments];
  const registeredCount = registeredDocuments.length;
  const hasWorkspaceDocuments = workspaceDocuments.length > 0;
  const hasFailedAttempts = failedAttempts.length > 0;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [docs, quotaBody] = await Promise.all([fetchHiveDocuments(hiveId), fetchUploadQuota()]);
      setDocuments(docs.documents);
      setQuota(quotaBody.quota);
      setPolicy(quotaBody.policy);
    } catch {
      setError("Could not load documents. Refresh to try again.");
    } finally {
      setLoading(false);
    }
  }, [hiveId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSnapshotChangeRef = useRef(onSnapshotChange);
  onSnapshotChangeRef.current = onSnapshotChange;
  useEffect(() => {
    if (!loading) {
      onSnapshotChangeRef.current?.({ documents, uploadBusy });
    }
  }, [documents, uploadBusy, loading]);

  const quotaExhausted = isFreeUploadQuotaExhausted(quota);

  const runUpload = useCallback(
    async (files: File[], clientRequestIds?: string[]) => {
      if (files.length === 0 || uploadBusy || isFreeUploadQuotaExhausted(quota) || !policy) {
        return;
      }
      setUploadBusy(true);
      setUploadMessage(null);
      setError(null);
      const items = files.map((file, index) => ({
        file,
        client_request_id: clientRequestIds?.[index] ?? crypto.randomUUID(),
      }));
      const result = await uploadDocumentBatch({
        hiveId,
        items,
        policy,
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
    [hiveId, policy, quota, refresh, uploadBusy],
  );

  useEffect(() => {
    if (pendingStarted.current || initialPendingFiles.length === 0 || loading) {
      return;
    }
    pendingStarted.current = true;
    void (async () => {
      if (!isFreeUploadQuotaExhausted(quota) && policy) {
        await runUpload(initialPendingFiles);
      }
      onPendingFilesConsumed?.();
    })();
  }, [initialPendingFiles, loading, onPendingFilesConsumed, policy, quota, runUpload]);

  const onFilesSelected = (fileList: FileList | null) => {
    if (!fileList || uploadBusy || quotaExhausted || !policy) {
      return;
    }
    const accepted: File[] = [];
    for (const file of Array.from(fileList)) {
      const validation = validateUploadFile(file, policy);
      if (validation.ok) {
        accepted.push(file);
      }
    }
    if (accepted.length === 0) {
      setError(uploadValidationErrorLabel(policy));
      return;
    }
    void runUpload(accepted);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const onRetrySelected = (fileList: FileList | null) => {
    const clientRequestId = retryClientRequestIdRef.current;
    retryClientRequestIdRef.current = null;
    if (!fileList || !clientRequestId || uploadBusy || quotaExhausted || !policy) {
      return;
    }
    const file = fileList[0];
    if (!file) {
      return;
    }
    void runUpload([file], [clientRequestId]);
    if (retryInputRef.current) {
      retryInputRef.current.value = "";
    }
  };

  const openRetryPicker = (clientRequestId: string) => {
    retryClientRequestIdRef.current = clientRequestId;
    retryInputRef.current?.click();
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteBusy || uploadBusy) {
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteRegisteredDocumentUpload(hiveId, deleteTarget.client_request_id);
      setDeleteTarget(null);
      await refresh();
      setUploadMessage("Document deleted.");
    } catch (deleteErr) {
      setDeleteError(
        deleteErr instanceof Error ? deleteErr.message : "Could not delete this document. Try again.",
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  const openReplacePicker = (documentId: string) => {
    replaceTargetDocumentIdRef.current = documentId;
    replaceInputRef.current?.click();
  };

  const onReplaceSelected = (fileList: FileList | null) => {
    const supersedesDocumentId = replaceTargetDocumentIdRef.current;
    replaceTargetDocumentIdRef.current = null;
    if (!fileList || !supersedesDocumentId || uploadBusy || !policy) {
      return;
    }
    const file = fileList[0];
    if (!file) {
      return;
    }
    void (async () => {
      setUploadBusy(true);
      setUploadMessage(null);
      setError(null);
      setProgressLabel(`Replacing with ${file.name}…`);
      try {
        await replaceRegisteredDocument({
          hiveId,
          file,
          supersedesDocumentId,
          policy,
        });
        setUploadMessage("Document replaced.");
        await refresh();
      } catch (replaceErr) {
        setError(
          replaceErr instanceof Error
            ? replaceErr.message
            : "Could not replace this document. Try again.",
        );
      } finally {
        setUploadBusy(false);
        setProgressLabel(null);
        if (replaceInputRef.current) {
          replaceInputRef.current.value = "";
        }
      }
    })();
  };

  const dismissFailed = async (clientRequestId: string, documentId: string) => {
    if (dismissBusyId || uploadBusy) {
      return;
    }
    setDismissBusyId(documentId);
    setError(null);
    try {
      await dismissFailedDocumentUpload(hiveId, clientRequestId);
      await refresh();
    } catch (dismissError) {
      setError(
        dismissError instanceof Error
          ? dismissError.message
          : "Could not dismiss this failed upload. Try again.",
      );
    } finally {
      setDismissBusyId(null);
    }
  };

  const renderDocumentRow = (
    doc: SourceDocumentV1,
    options: { showRetry?: boolean; showDismiss?: boolean; showRegisteredActions?: boolean },
  ) => {
    const uiStatus = documentUploadUiStatus(doc.status);
    if (!uiStatus) {
      return null;
    }
    const kind = inferHfyDocKind(doc.filename);
    const label = hfyDocKindLabel(kind);
    const dateIso = doc.registered_at ?? doc.created_at;
    const dismissBusy = dismissBusyId === doc.id;
    return (
      <article
        key={doc.id}
        className="overflow-hidden rounded-[16px] border border-[#E7E9ED] bg-white"
      >
        <div className="flex flex-wrap items-center gap-4 px-5 py-4">
          <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[11px] bg-[#F1F4F8] text-[#4A525C]">
            <FileText className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="m-0 truncate text-base font-semibold text-[#1F2328]">{doc.filename}</p>
              <span className="inline-flex h-[22px] items-center rounded-[6px] bg-[#F1F3F6] px-2 text-xs font-semibold text-[#4A525C]">
                {label}
              </span>
            </div>
            <p className="m-0 mt-1 text-[13px] text-[#6B7280]">
              {formatFileSize(doc.byte_size)} · {formatDocumentUploadDate(dateIso)}
            </p>
          </div>
          <span
            className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold ${statusBadgeClass(uiStatus)}`}
          >
            {uiStatus === "uploading" ? (
              <span
                className="h-[11px] w-[11px] animate-spin rounded-full border-2 border-[#875700]/25 border-t-[#875700]"
                aria-hidden
              />
            ) : null}
            {documentUploadStatusLabel(uiStatus)}
          </span>
          {options.showRetry && uiStatus === "upload_failed" ? (
            <button
              type="button"
              disabled={uploadBusy || quotaExhausted || !policy || dismissBusy}
              onClick={() => openRetryPicker(doc.client_request_id)}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-[9px] border border-[#D9DDE3] bg-white px-3 text-sm font-semibold text-[#1F2328] hover:bg-[#F4F6F8] disabled:opacity-60"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Retry
            </button>
          ) : null}
          {options.showDismiss && uiStatus === "upload_failed" ? (
            <button
              type="button"
              disabled={uploadBusy || dismissBusy}
              onClick={() => void dismissFailed(doc.client_request_id, doc.id)}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-[9px] border border-[#D9DDE3] bg-white px-3 text-sm font-semibold text-[#1F2328] hover:bg-[#F4F6F8] disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              {dismissBusy ? "Removing…" : "Dismiss"}
            </button>
          ) : null}
          {options.showRegisteredActions && uiStatus === "uploaded" && doc.can_replace ? (
            <button
              type="button"
              disabled={uploadBusy || deleteBusy}
              onClick={() => openReplacePicker(doc.id)}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-[9px] border border-[#D9DDE3] bg-white px-3 text-sm font-semibold text-[#1F2328] hover:bg-[#F4F6F8] disabled:opacity-60"
            >
              Replace
            </button>
          ) : null}
          {options.showRegisteredActions && uiStatus === "uploaded" && doc.can_delete ? (
            <button
              type="button"
              disabled={uploadBusy || deleteBusy}
              onClick={() => {
                setDeleteError(null);
                setDeleteTarget(doc);
              }}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-[9px] border border-transparent bg-transparent px-3 text-sm font-semibold text-[#B4352A] hover:bg-[#FDEDEB] disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete
            </button>
          ) : null}
        </div>
        {uiStatus === "upload_failed" ? (
          <p className="m-0 border-t border-[#EEF0F3] px-5 py-3 pl-[78px] text-sm text-[#B4352A]">
            This upload did not finish. Retry with the same file, dismiss to remove it, or choose a
            different copy.
          </p>
        ) : null}
      </article>
    );
  };

  return (
    <section>
      <input
        ref={retryInputRef}
        id={retryInputId}
        type="file"
        className="sr-only"
        accept={policy ? buildUploadAcceptAttribute(policy) : undefined}
        onChange={(event) => onRetrySelected(event.target.files)}
        disabled={uploadBusy || !policy}
      />
      <input
        ref={replaceInputRef}
        id={replaceInputId}
        type="file"
        className="sr-only"
        accept={policy ? buildUploadAcceptAttribute(policy) : undefined}
        onChange={(event) => onReplaceSelected(event.target.files)}
        disabled={uploadBusy || !policy}
      />

      <DeleteDocumentModal
        filename={deleteTarget?.filename ?? ""}
        open={deleteTarget !== null}
        busy={deleteBusy}
        errorMessage={deleteError}
        onCancel={() => {
          if (!deleteBusy) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        onConfirm={() => void confirmDelete()}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="m-0 text-xl font-semibold text-[#1F2328]">Your documents</h2>
          {hasWorkspaceDocuments || hasFailedAttempts ? (
            <p className="mt-2 text-[15px] text-[#6B7280]">
              {registeredCount} document{registeredCount === 1 ? "" : "s"}
            </p>
          ) : (
            <p className="mt-2 text-[15px] text-[#4A525C]">
              Start by adding what you have. You can always add more later.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {quota ? (
            <p className="m-0 rounded-full bg-[#F3F6FC] px-3 py-1.5 text-sm text-[#4A525C]">
              <span className="font-semibold text-[#1F2328]">{quota.remaining}</span> of {quota.limit}{" "}
              uploads left this month (UTC)
            </p>
          ) : null}
          {hasWorkspaceDocuments ? (
            <>
              <input
                ref={inputRef}
                id={inputId}
                type="file"
                className="sr-only"
                multiple
                accept={policy ? buildUploadAcceptAttribute(policy) : undefined}
                onChange={(event) => onFilesSelected(event.target.files)}
                disabled={uploadBusy || quotaExhausted || !policy}
              />
              <label
                htmlFor={inputId}
                className={
                  uploadBusy || quotaExhausted || !policy
                    ? "inline-flex h-[42px] cursor-not-allowed items-center gap-2 rounded-[10px] border border-[#D9DDE3] bg-[#F4F6F8] px-4 text-sm font-semibold text-[#9AA0A6]"
                    : "inline-flex h-[42px] cursor-pointer items-center gap-2 rounded-[10px] border border-[#D9DDE3] bg-white px-4 text-sm font-semibold text-[#1F2328] hover:bg-[#F4F6F8]"
                }
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add documents
              </label>
            </>
          ) : null}
        </div>
      </div>

      {!hasWorkspaceDocuments ? (
        <div className="mt-6 flex min-h-[220px] flex-col items-center justify-center rounded-[18px] border-2 border-dashed border-[#C9CFD8] bg-[#FAFCFF] px-6 py-10 text-center">
          <Upload className="mb-3 h-8 w-8 text-[#2F6FE4]" aria-hidden />
          <p className="m-0 text-lg font-semibold text-[#1F2328]">Add documents</p>
          {quotaExhausted && policy ? (
            <div
              id={`${inputId}-quota-offer`}
              className="mt-4 w-full max-w-md rounded-[10px] border border-[#D6E4FF] bg-[#EEF4FF] px-4 py-3 text-left"
              role="status"
              aria-live="polite"
            >
              <p className="m-0 text-base font-semibold text-[#1F3F86]">
                {formatCommercialOfferHeadline(policy)}
              </p>
              <p className="m-0 mt-2 text-sm leading-relaxed text-[#4A525C]">
                {commercialOfferFootnote(policy)}
              </p>
            </div>
          ) : policy ? (
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-[#4A525C]">
              {uploadTypeGuidanceLabel(policy)}
            </p>
          ) : null}
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
                accept={policy ? buildUploadAcceptAttribute(policy) : undefined}
                onChange={(event) => onFilesSelected(event.target.files)}
                disabled={uploadBusy || !policy}
              />
              <label
                htmlFor={inputId}
                className={
                  uploadBusy || !policy
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
      ) : null}

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
      {hasWorkspaceDocuments && progressLabel ? (
        <p className="mt-4 text-sm text-[#4A525C]" aria-live="polite">
          {progressLabel}
        </p>
      ) : null}

      {hasWorkspaceDocuments ? (
        <div className="mt-8 flex flex-col gap-3">
          {loading ? (
            <p className="text-sm text-[#4A525C]">Loading…</p>
          ) : (
            workspaceDocuments.map((doc) =>
              renderDocumentRow(doc, { showRetry: false, showRegisteredActions: true }),
            )
          )}
        </div>
      ) : loading && !hasFailedAttempts ? (
        <p className="mt-8 text-sm text-[#4A525C]">Loading…</p>
      ) : null}

      {hasFailedAttempts ? (
        <section className={hasWorkspaceDocuments ? "mt-10" : "mt-8"} aria-labelledby={`${inputId}-failed-heading`}>
          <h3
            id={`${inputId}-failed-heading`}
            className="m-0 text-base font-semibold text-[#1F2328]"
          >
            Failed upload attempts
          </h3>
          <p className="mt-1 text-sm text-[#6B7280]">
            These did not count toward your document total or monthly upload quota.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {failedAttempts.map((doc) =>
              renderDocumentRow(doc, { showRetry: true, showDismiss: true }),
            )}
          </div>
        </section>
      ) : null}

      {hasWorkspaceDocuments && quotaExhausted && policy ? (
        <div
          className="mt-6 w-full rounded-[10px] border border-[#D6E4FF] bg-[#EEF4FF] px-4 py-3"
          role="status"
          aria-live="polite"
        >
          <p className="m-0 text-base font-semibold text-[#1F3F86]">
            {formatCommercialOfferHeadline(policy)}
          </p>
          <p className="m-0 mt-2 text-sm leading-relaxed text-[#4A525C]">
            {commercialOfferFootnote(policy)}
          </p>
        </div>
      ) : null}
    </section>
  );
}
