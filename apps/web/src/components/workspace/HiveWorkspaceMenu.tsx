"use client";

import { MoreHorizontal, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

type HiveWorkspaceMenuProps = {
  onDeleteHive: () => void;
};

export function HiveWorkspaceMenu({ onDeleteHive }: HiveWorkspaceMenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className="flex h-9 w-9 items-center justify-center rounded-[8px] text-[#6B7280] hover:bg-[#EEF0F3] hover:text-[#1F2328]"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden />
        <span className="sr-only">Hive options</span>
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-[10px] border border-[#E7E9ED] bg-white py-1 shadow-[0_12px_32px_rgba(31,35,40,0.12)]"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-[#B4352A] hover:bg-[#FDEDEB]"
            onClick={() => {
              setOpen(false);
              onDeleteHive();
            }}
          >
            <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
            Delete Hive
          </button>
        </div>
      ) : null}
    </div>
  );
}
