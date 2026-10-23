"use client";

import { ArrowUp, FileText, X } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";

import {
  isDescribedIntentReady,
  PURPOSE_DESCRIBED_PLACEHOLDER,
} from "@/lib/intake/intake-work-purpose";
import { formatFileSize } from "@/lib/format-file-metadata";
import {
  listPublicDomainPacks,
  type DomainPackPublicDomain,
} from "@/lib/domain-packs/public-metadata";
import { ACCEPTED_UPLOAD_MIME } from "@/lib/upload-constants";

const PUBLIC_DOMAIN_PACKS = listPublicDomainPacks();

const STARTER_SUGGESTIONS = [
  ...PUBLIC_DOMAIN_PACKS.flatMap((pack) =>
    (pack.starter_suggestions.length > 0
      ? pack.starter_suggestions.slice(0, 1)
      : []
    ).map((suggestion) => ({
      title: suggestion.title,
      domainId: pack.domain_id,
      fill: suggestion.fill,
    })),
  ),
  {
    title: "Review an agreement",
    domainId: null as string | null,
    fill: "List the services, amounts, and dates this agreement commits to.",
  },
];

function domainPillClass(pack: DomainPackPublicDomain, selected: boolean): string {
  const tone = pack.pill_tone ?? "default";
  const base =
    "start-dpill rounded-full px-3.5 py-2 text-[13.5px] font-medium min-h-10 cursor-pointer ";
  if (selected) {
    return `${base} border border-[#0D0D0D] bg-[#0D0D0D] text-white`;
  }
  return `${base} start-dpill-${tone} border border-[#E3E3E3] bg-white text-[#3C4043]`;
}

export type HiveComposerSubmit = {
  rawIntent: string;
  selectedDomainId: string | null;
  files: File[];
};

type HiveHomeComposerProps = {
  onSubmit: (payload: HiveComposerSubmit) => void;
  busy?: boolean;
};

export function HiveHomeComposer({ onSubmit, busy = false }: HiveHomeComposerProps) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rawIntent, setRawIntent] = useState("");
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);

  const addFiles = useCallback((files: File[]) => {
    setAttachments((current) => [...current, ...files]);
  }, []);

  const selectedPack =
    selectedDomainId !== null
      ? PUBLIC_DOMAIN_PACKS.find((pack) => pack.domain_id === selectedDomainId)
      : null;
  const explicitDomainReady =
    selectedDomainId !== null && (selectedPack?.executable ?? false);

  const canSubmit =
    attachments.length > 0 && (explicitDomainReady || isDescribedIntentReady(rawIntent));

  const placeholder = selectedPack?.placeholder ?? PURPOSE_DESCRIBED_PLACEHOLDER;

  const handleSubmit = () => {
    if (!canSubmit || busy) {
      return;
    }
    onSubmit({
      rawIntent: rawIntent.trim(),
      selectedDomainId,
      files: attachments,
    });
  };

  const toggleDomain = (domainId: string, executable: boolean) => {
    if (!executable) {
      return;
    }
    setSelectedDomainId((current) => (current === domainId ? null : domainId));
  };

  return (
    <section
      className="mx-auto flex w-full max-w-[720px] flex-col gap-4"
      data-testid="hive-home-composer"
      aria-label="Start a case"
    >
      <div className="start-composer box-border w-full rounded-[28px] border border-[#E3E3E3] bg-white px-3.5 pb-3 pl-[22px] pr-3.5 pt-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_28px_rgba(0,0,0,0.06)]">
        <label htmlFor="hive-composer-purpose" className="sr-only">
          Describe what you need
        </label>
        <textarea
          id="hive-composer-purpose"
          data-testid="hive-composer-intent"
          rows={3}
          className="w-full resize-none border-0 bg-transparent pb-0 pl-0 pr-2 pt-1.5 text-[17px] leading-normal text-[#0D0D0D] placeholder:text-[#8E9196] focus:outline-none focus:ring-0"
          placeholder={placeholder}
          value={rawIntent}
          onChange={(event) => setRawIntent(event.target.value)}
        />

        {attachments.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((file, index) => (
              <span
                key={`${file.name}-${file.size}-${index}`}
                data-testid="hive-composer-attachment-chip"
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#E3E3E3] bg-[#F8F9FA] px-2.5 py-1 text-sm text-[#0D0D0D]"
              >
                <FileText className="h-4 w-4 shrink-0 text-[#5F6368]" aria-hidden />
                <span className="truncate">{file.name}</span>
                <span className="shrink-0 text-xs text-[#5F6368]">{formatFileSize(file.size)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  data-testid="hive-composer-attachment-remove"
                  className="rounded p-0.5 hover:bg-[#E8EAED]"
                  onClick={() =>
                    setAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index))
                  }
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          className="sr-only"
          multiple
          accept={ACCEPTED_UPLOAD_MIME}
          onChange={(event) => {
            const list = event.target.files;
            if (list?.length) {
              addFiles(Array.from(list));
            }
            event.target.value = "";
          }}
        />

        <div className="mt-2 flex items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid="hive-composer-plus"
              aria-label="Add files"
              className="start-plusbtn -ml-2 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[#E3E3E3] bg-white"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#0D0D0D"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden
              >
                <line className="arm-u" x1="12" y1="12" x2="12" y2="5" />
                <line className="arm-r" x1="12" y1="12" x2="19" y2="12" />
                <line className="arm-d" x1="12" y1="12" x2="12" y2="19" />
                <line className="arm-l" x1="12" y1="12" x2="5" y2="12" />
              </svg>
            </button>
            {PUBLIC_DOMAIN_PACKS.map((pack) => {
              const selected = selectedDomainId === pack.domain_id;
              if (!pack.executable) {
                return (
                  <button
                    key={pack.domain_id}
                    type="button"
                    disabled
                    title="Coming Soon"
                    data-testid={`hive-composer-domain-${pack.domain_id}`}
                    aria-pressed={false}
                    className={`${domainPillClass(pack, false)} cursor-not-allowed opacity-50`}
                  >
                    {pack.short_label}
                  </button>
                );
              }
              return (
                <button
                  key={pack.domain_id}
                  type="button"
                  data-testid={`hive-composer-domain-${pack.domain_id}`}
                  aria-pressed={selected}
                  className={domainPillClass(pack, selected)}
                  onClick={() => toggleDomain(pack.domain_id, pack.executable)}
                >
                  {pack.short_label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            data-testid="hive-composer-submit"
            disabled={!canSubmit || busy}
            aria-label="Read my documents"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 ${
              !canSubmit || busy
                ? "cursor-not-allowed bg-[#ECECEC] text-[#9AA0A6]"
                : "cursor-pointer bg-[#0D0D0D] text-white"
            }`}
            onClick={handleSubmit}
          >
            <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {STARTER_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.title}
            type="button"
            className="min-h-10 cursor-pointer rounded-full border border-[#E3E3E3] bg-white px-4 py-2 text-sm text-[#3C4043] transition-colors hover:border-[#DADCE0] hover:bg-[#F8F9FA]"
            onClick={() => {
              if (!suggestion.domainId) {
                setSelectedDomainId(null);
                setRawIntent(suggestion.fill);
                return;
              }
              const pack = PUBLIC_DOMAIN_PACKS.find(
                (row) => row.domain_id === suggestion.domainId,
              );
              if (pack?.executable) {
                setSelectedDomainId(suggestion.domainId);
              } else {
                setSelectedDomainId(null);
              }
              setRawIntent(suggestion.fill);
            }}
          >
            {suggestion.title}
          </button>
        ))}
      </div>
    </section>
  );
}
