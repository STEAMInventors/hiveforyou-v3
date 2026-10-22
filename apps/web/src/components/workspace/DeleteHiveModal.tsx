"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  HIVE_DELETE_CONFIRMATION_TEXT,
  isHiveDeleteConfirmed,
} from "@/lib/hives/delete-hive-confirmation";

type DeleteHiveModalProps = {
  hiveName: string;
  open: boolean;
  busy: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteHiveModal({
  hiveName,
  open,
  busy,
  errorMessage,
  onCancel,
  onConfirm,
}: DeleteHiveModalProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (!open) {
      setConfirmText("");
      return;
    }
    inputRef.current?.focus();
  }, [open]);

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

  const confirmed = isHiveDeleteConfirmed(confirmText);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#1F2328]/40"
        aria-label="Close dialog"
        onClick={busy ? undefined : onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[61] w-full max-w-md rounded-[16px] border border-[#E7E9ED] bg-white p-6 shadow-[0_24px_48px_rgba(31,35,40,0.18)]"
      >
        <h2 id={titleId} className="m-0 text-[22px] font-semibold text-[#1F2328]">
          Delete this Hive?
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-[#4A525C]">
          This permanently deletes <span className="font-semibold text-[#1F2328]">{hiveName}</span>,
          all uploaded documents, and any data in this Hive. This cannot be undone.
        </p>
        <p className="mt-3 text-sm text-[#4A525C]">
          Type{" "}
          <span className="font-mono font-semibold text-[#1F2328]">{HIVE_DELETE_CONFIRMATION_TEXT}</span>{" "}
          to confirm.
        </p>
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={confirmText}
          disabled={busy}
          onChange={(event) => setConfirmText(event.target.value)}
          className="mt-3 h-11 w-full rounded-[10px] border border-[#D9DDE3] px-3 text-[15px] text-[#1F2328] disabled:bg-[#F4F6F8]"
        />
        {errorMessage ? (
          <p className="mt-3 text-sm text-[#B3261E]" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-11 rounded-[10px] border border-[#D9DDE3] bg-white px-4 text-sm font-semibold text-[#1F2328] hover:bg-[#F4F6F8] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!confirmed || busy}
            onClick={onConfirm}
            className="h-11 rounded-[10px] bg-[#C93D30] px-4 text-sm font-semibold text-white hover:bg-[#A93227] disabled:cursor-not-allowed disabled:bg-[#E8A8A2]"
          >
            {busy ? "Deleting…" : "Delete Hive"}
          </button>
        </div>
      </div>
    </div>
  );
}
