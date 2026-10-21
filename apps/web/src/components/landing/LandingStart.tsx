"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { HiveHomeComposer, type HiveComposerSubmit } from "@/components/intake/HiveHomeComposer";
import { CreateYourHiveModal } from "@/components/landing/CreateYourHiveModal";
import { useCreateHive } from "@/components/hives/useCreateHive";
import {
  clearLandingDraft,
  readLandingDraft,
  saveLandingDraft,
} from "@/lib/landing/draft-storage";

type LandingStartProps = {
  signedIn: boolean;
};

export function LandingStart({ signedIn }: LandingStartProps) {
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
    const suffix =
      pendingFiles.length > 3 ? ` and ${pendingFiles.length - 3} more` : "";
    return `You selected ${pendingFiles.length} file${pendingFiles.length === 1 ? "" : "s"} (${names.join(", ")}${suffix}). Document upload is not available yet — after you create your Hive, add documents from the workspace when uploads open.`;
  }, [pendingFiles]);

  const handleComposerSubmit = (payload: HiveComposerSubmit) => {
    const draftFiles = payload.files.map((file) => ({ name: file.name, size: file.size }));
    setPendingFiles(draftFiles);
    saveLandingDraft({
      rawIntent: payload.rawIntent,
      selectedDomainId: payload.selectedDomainId,
      files: draftFiles,
    });

    if (!signedIn) {
      router.push("/register?next=/");
      return;
    }

    setModalOpen(true);
  };

  const handleCreate = async () => {
    const result = await create.submit();
    if (!result) {
      return;
    }
    clearLandingDraft();
    setModalOpen(false);
    router.push(`/hives/${result.hiveId}`);
  };

  return (
    <>
      <HiveHomeComposer busy={create.submitBusy} onSubmit={handleComposerSubmit} />
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
      {create.submitError ? (
        <p className="text-center text-sm text-[#B3261E]" role="alert">
          {create.submitError}
        </p>
      ) : null}
    </>
  );
}
