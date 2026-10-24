"use client";

import { Pencil } from "lucide-react";
import { useRef, useState } from "react";

import type { HiveDocumentsSnapshot } from "@/components/workspace/HiveDocumentsPanel";
import { getPublicDomainPack } from "@/lib/domain-packs/public-metadata";
import { partitionDocumentWorkspaceLists } from "@/lib/documents/document-workspace-lists";
import {
  capturedQuestionForAnalyze,
  continueAction,
  isQuestionChanged,
  runDocumentCounts,
  studyDomainHintLabel,
  studyRunSummaryText,
} from "@/lib/study-runs/handoff";
import type { HiveStudyRun } from "@/lib/study-runs/use-hive-study-run";

type HiveAnalyzeHeaderProps = {
  study: HiveStudyRun;
  documents: HiveDocumentsSnapshot | null;
  onViewResults: () => void;
};

const PRIMARY_BUTTON =
  "inline-flex h-12 items-center justify-center rounded-[12px] bg-[#2F6FE4] px-7 text-base font-semibold text-white hover:bg-[#2456B8] disabled:cursor-not-allowed disabled:bg-[#C9D6F2]";
const SECONDARY_BUTTON =
  "inline-flex h-12 items-center justify-center rounded-[12px] border border-[#D9DDE3] bg-white px-5 text-sm font-semibold text-[#1F2328] hover:bg-[#F4F6F8] disabled:opacity-60";

export function HiveAnalyzeHeader({ study, documents, onViewResults }: HiveAnalyzeHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const statusRef = useRef<HTMLDivElement>(null);

  const { activeRun } = study;
  const hasQuestion = capturedQuestionForAnalyze(study.requestText) != null;
  const showEditor = study.loaded && !study.locked && (editing || !hasQuestion);

  const lists = documents ? partitionDocumentWorkspaceLists(documents.documents) : null;
  const readyDocumentCount = lists?.registeredDocuments.length ?? 0;
  const uploadingCount = documents
    ? (lists?.inProgressDocuments.length ?? 0) + (documents.uploadBusy ? 1 : 0)
    : 0;
  const counts = runDocumentCounts(documents?.documents ?? [], activeRun?.created_at ?? null);
  const runDocumentTotal = documents ? counts.included : null;

  const action =
    !study.loaded || !documents
      ? ({ kind: "disabled", reason: "Loading your Hive…" } as const)
      : continueAction({
          runStatus: activeRun?.status ?? null,
          requestText: study.requestText,
          questionChanged: isQuestionChanged({
            requestText: study.requestText,
            domainId: study.domainId,
            lastRequestText: study.lastIntent.requestText,
            lastDomainId: study.lastIntent.domainId,
          }),
          newDocumentCount: activeRun ? counts.addedSince : 0,
          readyDocumentCount,
          uploadingCount,
          busy: study.busy,
        });

  const summary = studyRunSummaryText(activeRun, runDocumentTotal);
  const domainLabel = study.domainId
    ? studyDomainHintLabel(study.domainId, (id) => getPublicDomainPack(id)?.short_label)
    : null;

  const showProgress = () => {
    statusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    statusRef.current?.focus();
  };

  const startEditing = () => {
    setDraft(study.requestText);
    setEditing(true);
  };

  const saveDraft = () => {
    if (capturedQuestionForAnalyze(draft) == null) {
      return;
    }
    study.saveQuestion(draft.trim());
    setEditing(false);
  };

  const editorValue = editing ? draft : study.requestText;
  const docsPhrase =
    readyDocumentCount === 1 ? "your document" : `your ${readyDocumentCount} documents`;

  let primary: { label: string; onClick?: () => void; disabled: boolean };
  let helper: string | null = null;
  switch (action.kind) {
    case "start":
      primary = { label: "Continue", onClick: () => void study.submit(), disabled: false };
      helper = `We'll read ${docsPhrase} to answer your question.`;
      break;
    case "retry":
      primary = { label: "Try again", onClick: () => void study.submit(), disabled: false };
      helper = `This starts a new analysis of ${docsPhrase}.`;
      break;
    case "view_progress":
      primary = { label: "View progress", onClick: showProgress, disabled: false };
      break;
    case "view_results":
      primary = { label: "View results", onClick: onViewResults, disabled: false };
      if (action.canAnalyzeChanges) {
        helper = "Your question or documents changed since the last analysis.";
      }
      break;
    default:
      primary = { label: study.busy ? "Starting…" : "Continue", disabled: true };
      helper = action.reason;
  }
  const unsavedEdit = showEditor && editing;
  if (unsavedEdit && action.kind !== "view_progress") {
    primary = { ...primary, onClick: undefined, disabled: true };
    helper = "Save your question to continue.";
  }

  return (
    <section
      className="rounded-[18px] border border-[#E7E9ED] bg-white p-6 md:p-8"
      aria-labelledby="hive-question-heading"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="hive-question-heading"
          className="m-0 text-sm font-semibold uppercase tracking-[0.06em] text-[#6B7280]"
        >
          Your question
        </h2>
        {domainLabel ? (
          <span
            className="inline-flex h-[22px] items-center rounded-[6px] bg-[#F1F3F6] px-2 text-xs font-semibold text-[#4A525C]"
            data-testid="study-domain-hint"
          >
            {domainLabel}
          </span>
        ) : null}
      </div>

      {showEditor ? (
        <div className="mt-3">
          <label className="sr-only" htmlFor="study-request-text">
            What should this Hive answer?
          </label>
          <textarea
            id="study-request-text"
            className="min-h-[96px] w-full max-w-3xl rounded-[12px] border border-[#D9DDE3] px-3 py-2 text-base text-[#1F2328]"
            value={editorValue}
            onChange={(event) => {
              setDraft(event.target.value);
              setEditing(true);
            }}
            placeholder="Describe what you want to learn from these documents."
            data-testid="study-request-text"
          />
          {editing ? (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-[9px] bg-[#1F2328] px-4 text-sm font-semibold text-white disabled:opacity-50"
                disabled={capturedQuestionForAnalyze(draft) == null}
                onClick={saveDraft}
              >
                Save
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-[9px] border border-[#D9DDE3] bg-white px-4 text-sm font-semibold text-[#1F2328]"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 flex items-start gap-3">
          <p
            className="m-0 max-w-3xl flex-1 whitespace-pre-wrap font-brand text-[clamp(1.125rem,2.4vw,1.375rem)] font-medium leading-snug text-[#1F2328]"
            data-testid="study-question-text"
          >
            {study.loaded ? study.requestText : "Loading your question…"}
          </p>
          {study.loaded && !study.locked ? (
            <button
              type="button"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] px-3 text-sm font-semibold text-[#2456B8] hover:bg-[#F3F6FC]"
              onClick={startEditing}
              data-testid="edit-study-question"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit
            </button>
          ) : null}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#EEF0F3] pt-6">
        <button
          type="button"
          className={PRIMARY_BUTTON}
          disabled={primary.disabled}
          onClick={primary.onClick}
          data-testid="hive-continue"
        >
          {primary.label}
        </button>
        {action.kind === "view_results" && action.canAnalyzeChanges ? (
          <button
            type="button"
            className={SECONDARY_BUTTON}
            disabled={study.busy || unsavedEdit}
            onClick={() => void study.submit()}
            data-testid="hive-analyze-changes"
          >
            Analyze with changes
          </button>
        ) : null}
        {helper ? (
          <p className="m-0 text-sm text-[#4A525C]" data-testid="hive-continue-helper">
            {helper}
          </p>
        ) : null}
      </div>

      {summary ? (
        <div
          ref={statusRef}
          tabIndex={-1}
          className="mt-4 rounded-[12px] bg-[#F9FAFB] px-4 py-3 text-sm text-[#1F2328] outline-none focus-visible:ring-2 focus-visible:ring-[#2F6FE4]"
          role="status"
          aria-live="polite"
          data-testid="study-run-summary"
        >
          <p className="m-0 font-medium">{summary}</p>
          {activeRun?.status === "FAILED" && activeRun.error_message_safe ? (
            <p className="mt-1 m-0 text-[#B42318]">{activeRun.error_message_safe}</p>
          ) : null}
        </div>
      ) : null}

      {study.error ? (
        <p className="mt-3 text-sm text-[#B42318]" role="alert">
          {study.error}
        </p>
      ) : null}
      {study.statusNote ? (
        <p className="mt-3 text-sm text-[#875700]" role="status">
          {study.statusNote}
        </p>
      ) : null}
    </section>
  );
}
