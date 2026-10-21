"use client";

import { useRouter } from "next/navigation";

import { useHiveComposerCreateFlow } from "@/components/hives/useHiveComposerCreateFlow";

type LandingStartProps = {
  signedIn: boolean;
};

export function LandingStart({ signedIn }: LandingStartProps) {
  const router = useRouter();
  const flow = useHiveComposerCreateFlow({
    signedIn,
    onHiveCreated: (hiveId) => {
      router.push(`/hives/${hiveId}`);
    },
  });

  return (
    <>
      {flow.composer}
      {flow.modal}
      {flow.submitErrorAlert}
    </>
  );
}
