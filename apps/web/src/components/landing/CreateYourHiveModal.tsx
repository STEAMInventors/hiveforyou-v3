"use client";

import { useEffect, useId, useRef } from "react";

import {
  HIVE_DESCRIPTION_MAX_LENGTH,
  HIVE_NAME_MAX_LENGTH,
} from "@/components/landing/create-hive-validation";

export type CreateYourHiveModalProps = {
  open: boolean;
  hiveName: string;
  hiveDescription: string;
  nameError?: string | null;
  descriptionError?: string | null;
  submitBusy?: boolean;
  pendingFileNotice?: string | null;
  onHiveNameChange: (value: string) => void;
  onHiveDescriptionChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function CreateYourHiveModal({
  open,
  hiveName,
  hiveDescription,
  nameError = null,
  descriptionError = null,
  submitBusy = false,
  pendingFileNotice = null,
  onHiveNameChange,
  onHiveDescriptionChange,
  onCancel,
  onSubmit,
}: CreateYourHiveModalProps) {
  const titleId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center px-4 py-6 sm:items-center sm:py-8"
      data-testid="landing-create-hive-modal"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#1F2328]/40 backdrop-blur-[1px]"
        aria-label="Close dialog"
        onClick={onCancel}
        disabled={submitBusy}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-lg rounded-[18px] border border-[#E7E9ED] bg-white p-6 shadow-lg sm:max-h-[90vh] sm:overflow-y-auto sm:p-7"
      >
        <div className="flex flex-col gap-1.5">
          <h2
            id={titleId}
            className="text-[1.875rem] font-semibold leading-tight tracking-[-0.02em] text-[#0D0D0D]"
            style={{ fontFamily: "var(--font-outfit), sans-serif" }}
          >
            Create a Hive
          </h2>
          <p className="m-0 text-[15px] leading-relaxed text-[#4A525C]">
            A private space for one situation. You can rename it later.
          </p>
        </div>

        {pendingFileNotice ? (
          <p
            className="mt-4 rounded-[10px] border border-[#EBDDB4] bg-[#FBF4E2] px-3.5 py-2.5 text-sm leading-snug text-[#3D3000]"
            data-testid="landing-create-hive-upload-notice"
          >
            {pendingFileNotice}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#0D0D0D]">
            Hive name
            <input
              ref={nameInputRef}
              type="text"
              value={hiveName}
              maxLength={HIVE_NAME_MAX_LENGTH}
              placeholder="e.g. Maya's IEP 2025–26"
              data-testid="landing-create-hive-name"
              aria-invalid={nameError ? true : undefined}
              className={
                nameError
                  ? "min-h-[46px] rounded-[10px] border border-[#B3261E] bg-white px-3.5 text-[15px] text-[#0D0D0D] outline-none ring-2 ring-[#FCECEA]"
                  : "min-h-[46px] rounded-[10px] border border-[#DADCE0] bg-white px-3.5 text-[15px] text-[#0D0D0D] outline-none focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#EEF4FF]"
              }
              onChange={(event) => {
                onHiveNameChange(event.target.value);
              }}
            />
          </label>
          {nameError ? (
            <p className="-mt-2 text-sm text-[#B3261E]" role="alert">
              {nameError}
            </p>
          ) : null}

          <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#0D0D0D]">
            Description <span className="font-normal text-[#5F6368]">(optional)</span>
            <textarea
              value={hiveDescription}
              maxLength={HIVE_DESCRIPTION_MAX_LENGTH}
              rows={3}
              placeholder="What this Hive is for — optional"
              data-testid="landing-create-hive-description"
              className="resize-y rounded-[10px] border border-[#DADCE0] bg-white px-3.5 py-2.5 text-[15px] leading-relaxed text-[#0D0D0D] outline-none focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#EEF4FF]"
              onChange={(event) => {
                onHiveDescriptionChange(event.target.value);
              }}
            />
          </label>
          {descriptionError ? (
            <p className="-mt-2 text-sm text-[#B3261E]" role="alert">
              {descriptionError}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2.5">
          <button
            type="button"
            disabled={submitBusy}
            className="h-11 rounded-[10px] border border-[#E7E9ED] bg-white px-[18px] text-[15px] font-semibold text-[#0D0D0D] hover:bg-[#F4F6F8] disabled:opacity-60"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitBusy}
            data-testid="landing-create-hive-submit"
            className="h-11 rounded-[10px] border-0 bg-[#2F6FE4] px-5 text-[15px] font-semibold text-white hover:bg-[#2456B8] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onSubmit}
          >
            {submitBusy ? "Creating…" : "Create Hive"}
          </button>
        </div>
      </div>
    </div>
  );
}
