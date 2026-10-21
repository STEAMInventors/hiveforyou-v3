"use client";

import Link from "next/link";

import type { HiveV1 } from "@hiveforyou/contracts/hives/v1";

function formatActivity(updatedAt: string): string {
  const date = new Date(updatedAt);
  return `Updated ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

export function HiveCardGrid({ hives }: { hives: HiveV1[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
      {hives.map((hive) => (
        <Link
          key={hive.id}
          href={`/hives/${hive.id}`}
          className="group flex min-h-[190px] flex-col justify-between rounded-[18px] border border-[#E7E9ED] bg-white p-5 no-underline shadow-[0_1px_2px_rgba(31,35,40,0.04)] transition-shadow hover:shadow-[0_8px_24px_rgba(31,35,40,0.08)]"
        >
          <div>
            <span className="inline-flex rounded-full bg-[#EAF6EE] px-2.5 py-1 text-xs font-semibold text-[#1E7A41]">
              Add documents
            </span>
            <h2 className="mt-3 m-0 font-brand text-[21px] font-semibold text-[#1F2328] group-hover:text-[#2456B8]">
              {hive.name}
            </h2>
            {hive.description ? (
              <p className="mt-2 line-clamp-2 text-sm text-[#4A525C]">{hive.description}</p>
            ) : null}
          </div>
          <p className="mt-4 text-xs text-[#6B7280]">{formatActivity(hive.updated_at)}</p>
        </Link>
      ))}
    </div>
  );
}
