"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { HiveHomeComposer, type HiveComposerSubmit } from "@/components/intake/HiveHomeComposer";
import { CreateYourHiveModal } from "@/components/landing/CreateYourHiveModal";
import { useCreateHive } from "@/components/hives/useCreateHive";
import {
  clearLandingDraft,
  readLandingDraft,
  saveLandingDraft,
} from "@/lib/landing/draft-storage";

export type UseHiveComposerCreateFlowOptions = {
  signedIn: boolean;
  guestRegisterHref?: string;
  onHiveCreated: (hiveId: string) => void;
};

export function useHiveComposerCreateFlow({
  signedIn,
  guestRegisterHref = "/register?next=/",
  onHiveCreated,
}: UseHiveComposerCreateFlowOptions) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ name: string; size: number }[]>([]);
  const create = useCreateHive();

  useEffect(() => {
    const draft = readLandingDraft();
    if (!draft) {
      return;
    }
    setPendingFiles(draft.files);
    if (signedIn && draft.files.length > 0) {
      setModalOpen(true);
    }
  }, [signedIn]);

  const pendingFileNotice = useMemo(() => {
    if (pendingFiles.length === 0) {
      return null;
    }
    const names = pendingFiles.map((file) => file.name).slice(0, 3);
    const suffix = pendingFiles.length > 3 ? ` and ${pendingFiles.length - 3} more` : "";
    return `You selected ${pendingFiles.length} file${pendingFiles.length === 1 ? "" : "s"} (${names.join(", ")}${suffix}). Document upload is not available yet — after you create your Hive, add documents from the workspace when uploads open.`;
  }, [pendingFiles]);

  const handleComposerSubmit = useCallback(
    (payload: HiveComposerSubmit) => {
      const draftFiles = payload.files.map((file) => ({ name: file.name, size: file.size }));
      setPendingFiles(draftFiles);
      saveLandingDraft({
        rawIntent: payload.rawIntent,
        selectedDomainId: payload.selectedDomainId,
        files: draftFiles,
      });

      if (!signedIn) {
        router.push(guestRegisterHref);
        return;
      }

      setModalOpen(true);
    },
    [guestRegisterHref, router, signedIn],
  );

  const handleCreate = useCallback(async () => {
    const result = await create.submit();
    if (!result) {
      return;
    }
    clearLandingDraft();
    setModalOpen(false);
    create.resetForm();
    onHiveCreated(result.hiveId);
  }, [create, onHiveCreated]);

  const openCreateModal = useCallback(() => {
    setModalOpen(true);
  }, []);

  const composer: ReactNode = (
    <HiveHomeComposer busy={create.submitBusy} onSubmit={handleComposerSubmit} />
  );

  const modal: ReactNode = (
    <CreateYourHiveModal
      open={modalOpen}
      hiveName={create.hiveName}
      hiveDescription={create.hiveDescription}
      nameError={create.nameError}
      descriptionError={create.descriptionError}
      submitBusy={create.submitBusy}
      pendingFileNotice={pendingFileNotice}
      onHiveNameChange={create.setHiveName}
      onHiveDescriptionChange={create.setHiveDescription}
      onCancel={() => {
        if (!create.submitBusy) {
          setModalOpen(false);
        }
      }}
      onSubmit={() => {
        void handleCreate();
      }}
    />
  );

  const submitErrorAlert: ReactNode = create.submitError ? (
    <p className="text-center text-sm text-[#B3261E]" role="alert">
      {create.submitError}
    </p>
  ) : null;

  return {
    composer,
    modal,
    submitErrorAlert,
    openCreateModal,
    submitBusy: create.submitBusy,
  };
}
