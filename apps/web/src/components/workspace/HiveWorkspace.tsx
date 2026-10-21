"use client";

import Link from "next/link";
import { useState } from "react";

import { HiveCustomerShell } from "@/components/shell/HiveCustomerShell";
import type { HiveV1 } from "@hiveforyou/contracts/hives/v1";

const TABS = ["Documents", "Canonical Study", "Reports"] as const;

type Tab = (typeof TABS)[number];

export function HiveWorkspace({ hive }: { hive: HiveV1 }) {
  const [tab, setTab] = useState<Tab>("Documents");

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

        <div className="mb-6">
          <h1 className="m-0 font-brand text-[clamp(1.75rem,4vw,2.125rem)] font-semibold text-[#1F2328]">
            {hive.name}
          </h1>
          {hive.description ? (
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[#4A525C]">{hive.description}</p>
          ) : null}
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
          <section>
            <h2 className="m-0 text-xl font-semibold text-[#1F2328]">Your documents</h2>
            <p className="mt-2 text-[15px] text-[#4A525C]">
              Start by adding what you have. You can always add more later.
            </p>
            <div
              className="mt-6 flex min-h-[220px] flex-col items-center justify-center rounded-[18px] border-2 border-dashed border-[#C9CFD8] bg-[#FAFCFF] px-6 py-10 text-center"
              aria-disabled="true"
            >
              <p className="m-0 text-lg font-semibold text-[#1F2328]">Uploads coming next</p>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-[#4A525C]">
                Document upload and processing are not available in this release. Your Hive is ready;
                you can return here when uploads open.
              </p>
              <span className="mt-4 inline-flex cursor-not-allowed rounded-[10px] bg-[#ECECEC] px-4 py-2 text-sm font-semibold text-[#9AA0A6]">
                Add documents
              </span>
            </div>
          </section>
        ) : (
          <section className="rounded-[18px] border border-[#E7E9ED] bg-white p-8 text-center">
            <h2 className="m-0 text-lg font-semibold text-[#1F2328]">
              Your study starts with your documents
            </h2>
            <p className="mt-2 text-sm text-[#4A525C]">
              When uploads are available, add documents on the Documents tab first.
            </p>
            <button
              type="button"
              className="mt-4 rounded-[10px] border border-[#E7E9ED] bg-white px-4 py-2 text-sm font-semibold"
              onClick={() => setTab("Documents")}
            >
              Go to Documents
            </button>
          </section>
        )}
      </div>
    </HiveCustomerShell>
  );
}
