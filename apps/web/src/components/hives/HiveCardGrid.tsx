"use client";

import Link from "next/link";
import { useState } from "react";

import type { HiveV1 } from "@hiveforyou/contracts/hives/v1";
import { HiveCardMenu } from "@/components/hives/HiveCardMenu";
import {
  formatHiveFilenamePreview,
  formatRegisteredDocumentCount,
  HIVE_DOMAIN_UNKNOWN_LABEL,
} from "@/lib/hives/hive-card-summary";
import { isHiveDeletionPending } from "@/lib/hives/hive-deletion-state";

function formatActivity(updatedAt: string): string {
  const date = new Date(updatedAt);
  return `Updated ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

type HiveCardGridProps = {
  hives: HiveV1[];
  onRetryDeletion: (hiveId: string) => Promise<void>;
  onRequestDelete: (hive: HiveV1) => void;
};

export function HiveCardGrid({ hives, onRetryDeletion, onRequestDelete }: HiveCardGridProps) {
  const [retryHiveId, setRetryHiveId] = useState<string | null>(null);
  const [retryErrorByHiveId, setRetryErrorByHiveId] = useState<Record<string, string>>({});

  const handleRetry = async (hiveId: string) => {
    setRetryHiveId(hiveId);
    setRetryErrorByHiveId((prev) => {
      const next = { ...prev };
      delete next[hiveId];
      return next;
    });
    try {
      await onRetryDeletion(hiveId);
    } catch (err) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Could not finish deleting this Hive. Try again.";
      setRetryErrorByHiveId((prev) => ({ ...prev, [hiveId]: message }));
    } finally {
      setRetryHiveId(null);
    }
  };

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
      {hives.map((hive) => {
        const deletionPending = isHiveDeletionPending(hive);
        const retryBusy = retryHiveId === hive.id;
        const retryError = retryErrorByHiveId[hive.id];
        const documentCountLabel = formatRegisteredDocumentCount(hive.registered_document_count);
        const filenamePreview = formatHiveFilenamePreview(
          hive.registered_document_count,
          hive.preview_filenames,
        );

        if (deletionPending) {
          return (
            <div
              key={hive.id}
              className="flex min-h-[190px] flex-col justify-between rounded-[18px] border border-[#F0D4D4] bg-[#FFFBFB] p-5 shadow-[0_1px_2px_rgba(31,35,40,0.04)]"
            >
              <div>
                <span className="inline-flex rounded-full bg-[#FCE8E8] px-2.5 py-1 text-xs font-semibold text-[#B42318]">
                  Deletion incomplete
                </span>
                <h2 className="mt-3 m-0 font-brand text-[21px] font-semibold text-[#1F2328]">
                  {hive.name}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[#4A525C]">
                  We could not finish removing this Hive. Retry deletion to clean up files and
                  remove it from your account.
                </p>
                {retryError ? (
                  <p className="mt-3 text-sm text-[#B42318]" role="alert">
                    {retryError}
                  </p>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="m-0 text-xs text-[#6B7280]">{formatActivity(hive.updated_at)}</p>
                <button
                  type="button"
                  className="inline-flex h-9 items-center rounded-[10px] border border-[#E7E9ED] bg-white px-3 text-sm font-semibold text-[#1F2328] hover:bg-[#F6F7F9] disabled:opacity-60"
                  disabled={retryBusy}
                  onClick={() => {
                    void handleRetry(hive.id);
                  }}
                >
                  {retryBusy ? "Retrying…" : "Retry deletion"}
                </button>
              </div>
            </div>
          );
        }

        return (
          <article
            key={hive.id}
            className="flex min-h-[190px] flex-col justify-between rounded-[18px] border border-[#E7E9ED] bg-white p-5 shadow-[0_1px_2px_rgba(31,35,40,0.04)] transition-shadow hover:shadow-[0_8px_24px_rgba(31,35,40,0.08)]"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/hives/${hive.id}`}
                  className="min-w-0 flex-1 no-underline"
                >
                  <h2 className="m-0 font-brand text-[21px] font-semibold text-[#1F2328] hover:text-[#2456B8]">
                    {hive.name}
                  </h2>
                </Link>
                <HiveCardMenu hiveId={hive.id} onDeleteHive={() => onRequestDelete(hive)} />
              </div>
              <p className="mt-2 text-sm text-[#6B7280]">{HIVE_DOMAIN_UNKNOWN_LABEL}</p>
              {hive.description ? (
                <p className="mt-2 line-clamp-2 text-sm text-[#4A525C]">{hive.description}</p>
              ) : null}
              {documentCountLabel ? (
                <p className="mt-2 text-sm font-semibold text-[#1F2328]">{documentCountLabel}</p>
              ) : null}
              {filenamePreview ? (
                <p className="mt-1 line-clamp-2 text-sm text-[#4A525C]">{filenamePreview}</p>
              ) : null}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="m-0 text-xs text-[#6B7280]">{formatActivity(hive.updated_at)}</p>
              <Link
                href={`/hives/${hive.id}`}
                className="text-sm font-semibold text-[#2456B8] no-underline hover:underline"
              >
                Open Hive
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
