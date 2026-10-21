"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CreateYourHiveModal } from "@/components/landing/CreateYourHiveModal";
import { HiveCardGrid } from "@/components/hives/HiveCardGrid";
import { useCreateHive } from "@/components/hives/useCreateHive";
import { HiveCustomerShell } from "@/components/shell/HiveCustomerShell";
import type { HiveV1 } from "@hiveforyou/contracts/hives/v1";
import { fetchMyHives, HiveApiError } from "@/lib/hives/client";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function MyHivesExperience() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hives, setHives] = useState<HiveV1[]>([]);
  const [firstName, setFirstName] = useState("there");
  const [modalOpen, setModalOpen] = useState(false);
  const create = useCreateHive();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchMyHives();
      setHives(payload.hives);
    } catch (err) {
      setError(err instanceof HiveApiError ? err.message : "Could not load your Hives.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    void (async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data } = await supabase.auth.getUser();
        const name =
          (data.user?.user_metadata?.full_name as string | undefined)?.trim()?.split(/\s+/)[0] ??
          data.user?.email?.split("@")[0] ??
          "there";
        setFirstName(name);
      } catch {
        setFirstName("there");
      }
    })();
  }, []);

  const handleCreate = async () => {
    const result = await create.submit();
    if (!result) {
      return;
    }
    setModalOpen(false);
    create.resetForm();
    window.location.href = `/hives/${result.hiveId}`;
  };

  return (
    <HiveCustomerShell>
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-9 px-4 py-10 md:px-8 md:py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="m-0 font-brand text-[clamp(1.75rem,4vw,2.25rem)] font-semibold tracking-tight text-[#1F2328]">
              {greeting()}, {firstName}
            </h1>
            <p className="mt-2 text-[15px] text-[#4A525C]">
              Each Hive keeps one situation&apos;s documents together.
            </p>
          </div>
          {hives.length > 0 ? (
            <button
              type="button"
              className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-[#2F6FE4] px-4 text-[15px] font-semibold text-white hover:bg-[#2456B8]"
              onClick={() => setModalOpen(true)}
            >
              Create a Hive
            </button>
          ) : null}
        </div>

        {loading ? (
          <p className="text-sm text-[#6B7280]" role="status">
            Loading your Hives…
          </p>
        ) : null}
        {error ? (
          <div className="rounded-[18px] border border-[#E7E9ED] bg-white p-8 text-center">
            <p className="text-sm text-[#4A525C]">{error}</p>
            <button
              type="button"
              className="mt-4 rounded-[10px] border border-[#E7E9ED] px-4 py-2 text-sm font-semibold"
              onClick={() => {
                void load();
              }}
            >
              Try again
            </button>
          </div>
        ) : null}

        {!loading && !error && hives.length === 0 ? (
          <div className="rounded-[18px] border border-[#E7E9ED] bg-white px-6 py-12 text-center shadow-[0_1px_2px_rgba(31,35,40,0.04),0_8px_28px_rgba(31,35,40,0.06)]">
            <h2 className="m-0 text-xl font-semibold text-[#1F2328]">Create your first Hive</h2>
            <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[#4A525C]">
              A Hive is a private space for one situation, like your child&apos;s IEP. Add the
              documents you have, and we&apos;ll help you understand them together.
            </p>
            <button
              type="button"
              className="mt-6 inline-flex h-11 items-center rounded-[10px] bg-[#2F6FE4] px-5 text-[15px] font-semibold text-white hover:bg-[#2456B8]"
              onClick={() => setModalOpen(true)}
            >
              Create a Hive
            </button>
          </div>
        ) : null}

        {!loading && !error && hives.length > 0 ? <HiveCardGrid hives={hives} /> : null}
      </div>

      <CreateYourHiveModal
        open={modalOpen}
        hiveName={create.hiveName}
        hiveDescription={create.hiveDescription}
        nameError={create.nameError}
        descriptionError={create.descriptionError}
        submitBusy={create.submitBusy}
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
        <p className="pb-6 text-center text-sm text-[#B3261E]" role="alert">
          {create.submitError}
        </p>
      ) : null}
    </HiveCustomerShell>
  );
}
