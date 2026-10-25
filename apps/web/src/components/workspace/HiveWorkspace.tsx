"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CanonicalStudyStatusPanel } from "@/components/workspace/CanonicalStudyStatusPanel";
import { DeleteHiveModal } from "@/components/workspace/DeleteHiveModal";
import { HiveAnalyzeHeader } from "@/components/workspace/HiveAnalyzeHeader";
import { HiveProgressModal } from "@/components/workspace/HiveProgressModal";
import {
  HiveDocumentsPanel,
  type HiveDocumentsSnapshot,
} from "@/components/workspace/HiveDocumentsPanel";
import { HiveWorkspaceMenu } from "@/components/workspace/HiveWorkspaceMenu";
import { usePendingLandingUpload } from "@/components/workspace/usePendingLandingUpload";
import { HiveCustomerShell } from "@/components/shell/HiveCustomerShell";
import type { HiveV1 } from "@hiveforyou/contracts/hives/v1";
import { deleteHive, HiveApiError } from "@/lib/hives/client";
import { partitionDocumentWorkspaceLists } from "@/lib/documents/document-workspace-lists";
import {
  continueAction,
  isQuestionChanged,
  runDocumentCounts,
  runIncludedDocuments,
} from "@/lib/study-runs/handoff";
import { useHiveStudyRun } from "@/lib/study-runs/use-hive-study-run";

const TABS = ["Documents", "Canonical Study", "Reports"] as const;

type Tab = (typeof TABS)[number];

export function HiveWorkspace({ hive }: { hive: HiveV1 }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Documents");
  const pending = usePendingLandingUpload(hive.id);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const study = useHiveStudyRun(hive.id);
  const [documents, setDocuments] = useState<HiveDocumentsSnapshot | null>(null);
  const runCreatedAt = study.activeRun?.created_at ?? null;
  const runCounts = documents ? runDocumentCounts(documents.documents, runCreatedAt) : null;
  const runDocumentTotal = runCounts ? runCounts.included : null;
  const runDocumentNames = documents
    ? runIncludedDocuments(documents.documents, runCreatedAt).map((doc) => doc.filename)
    : null;
  const lists = documents ? partitionDocumentWorkspaceLists(documents.documents) : null;
  const retryAvailable =
    study.loaded &&
    documents != null &&
    lists != null &&
    runCounts != null &&
    continueAction({
      runStatus: study.activeRun?.status ?? null,
      requestText: study.requestText,
      questionChanged: isQuestionChanged({
        requestText: study.requestText,
        domainId: study.domainId,
        lastRequestText: study.lastIntent.requestText,
        lastDomainId: study.lastIntent.domainId,
      }),
      newDocumentCount: runCounts.addedSince,
      readyDocumentCount: lists.registeredDocuments.length,
      uploadingCount: lists.inProgressDocuments.length + (documents.uploadBusy ? 1 : 0),
      busy: study.busy,
    }).kind === "retry";

  const handleDeleteConfirm = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteHive(hive.id);
      setDeleteOpen(false);
      router.push("/hives");
      router.refresh();
    } catch (error) {
      setDeleteError(
        error instanceof HiveApiError
          ? error.message
          : "Could not delete this Hive. Try again.",
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <HiveCustomerShell>
      <div className="mx-auto w-full max-w-[1160px] px-4 py-8 md:px-8 md:py-10">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-[#6B7280]">
          <Link href="/hives" className="font-medium text-[#2456B8] no-underline hover:underline">
            My Hives
          </Link>
          <span>/</span>
          <span>{hive.name}</span>
        </div>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="m-0 font-brand text-[clamp(1.75rem,4vw,2.125rem)] font-semibold text-[#1F2328]">
              {hive.name}
            </h1>
            {hive.description ? (
              <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[#4A525C]">
                {hive.description}
              </p>
            ) : null}
          </div>
          <HiveWorkspaceMenu onDeleteHive={() => setDeleteOpen(true)} />
        </div>

        <div className="mb-8 flex gap-6 border-b border-[#E8EAEE]">
          {TABS.map((label) => {
            const active = tab === label;
            return (
              <button
                key={label}
                type="button"
                className={
                  active
                    ? "-mb-px border-b-2 border-[#2F6FE4] pb-3 text-sm font-semibold text-[#2F6FE4]"
                    : "pb-3 text-sm font-medium text-[#6B7280] hover:text-[#1F2328]"
                }
                onClick={() => setTab(label)}
              >
                {label}
              </button>
            );
          })}
        </div>

        {tab === "Documents" ? (
          <div className="flex flex-col gap-8">
            <HiveAnalyzeHeader
              study={study}
              documents={documents}
              onViewResults={() => setTab("Canonical Study")}
              onOpenProgress={study.openProgress}
            />
            <HiveDocumentsPanel
              hiveId={hive.id}
              initialPendingFiles={pending.pendingFiles}
              onPendingFilesConsumed={pending.clearPending}
              onSnapshotChange={setDocuments}
            />
          </div>
        ) : tab === "Canonical Study" ? (
          <CanonicalStudyStatusPanel
            study={study}
            documentCount={runDocumentTotal}
            onGoToDocuments={() => setTab("Documents")}
            onOpenProgress={study.openProgress}
          />
        ) : (
          <section className="rounded-[18px] border border-[#E7E9ED] bg-white p-8 text-center">
            <h2 className="m-0 text-lg font-semibold text-[#1F2328]">Reports</h2>
            <p className="mt-2 text-sm text-[#4A525C]">
              Reports will appear here after processing and later release milestones.
            </p>
          </section>
        )}
      </div>

      <HiveProgressModal
        open={study.progressOpen && study.activeRun != null}
        run={study.activeRun}
        hiveName={hive.name}
        documentCount={runDocumentTotal}
        documentNames={runDocumentNames}
        questionCount={study.planningSummary?.merged_question_count ?? null}
        readingProgress={study.readingProgress}
        readingProgressObservedAt={study.readingProgressObservedAt}
        readingArrival={study.readingArrival}
        pollState={study.pollState}
        lastPollSuccessAt={study.lastPollSuccessAt}
        returnFocusRef={study.progressReturnFocusRef}
        onMinimize={study.minimizeProgress}
        onViewResults={() => {
          study.minimizeProgress();
          setTab("Canonical Study");
        }}
        onRetry={retryAvailable || study.busy ? () => void study.submit() : null}
        retryBusy={study.busy}
        retryError={study.error}
      />

      <DeleteHiveModal
        hiveName={hive.name}
        open={deleteOpen}
        busy={deleteBusy}
        errorMessage={deleteError}
        onCancel={() => {
          if (!deleteBusy) {
            setDeleteOpen(false);
            setDeleteError(null);
          }
        }}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </HiveCustomerShell>
  );
}
