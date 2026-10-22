"use client";

import { useEffect, useId } from "react";

type DeleteDocumentModalProps = {
  filename: string;
  open: boolean;
  busy: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteDocumentModal({
  filename,
  open,
  busy,
  errorMessage,
  onCancel,
  onConfirm,
}: DeleteDocumentModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#1F2328]/40"
        aria-label="Close dialog"
        disabled={busy}
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[61] w-full max-w-md rounded-[16px] border border-[#E7E9ED] bg-white p-6 shadow-lg"
      >
        <h2 id={titleId} className="m-0 text-[22px] font-semibold text-[#1F2328]">
          Delete this document?
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-[#4A525C]">
          <span className="font-semibold text-[#1F2328]">{filename}</span> will be removed from this
          Hive. This cannot be undone.
        </p>
        {errorMessage ? (
          <p className="mt-3 text-sm text-[#B4352A]" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex h-11 items-center rounded-[10px] border border-[#D9DDE3] bg-white px-[18px] text-[15px] font-semibold text-[#1F2328] hover:bg-[#F4F6F8] disabled:opacity-60"
          >
            Keep document
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex h-11 items-center rounded-[10px] border-none bg-[#C93D30] px-5 text-[15px] font-semibold text-white hover:bg-[#A93227] disabled:opacity-60"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
