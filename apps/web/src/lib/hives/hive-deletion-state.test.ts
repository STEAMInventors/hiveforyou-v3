import { describe, expect, it } from "vitest";

import { isHiveDeletionPending } from "./hive-deletion-state";

describe("hive deletion state", () => {
  it("treats non-null deleting_at as pending deletion", () => {
    expect(isHiveDeletionPending({ deleting_at: "2026-10-21T12:00:00.000Z" })).toBe(true);
    expect(isHiveDeletionPending({ deleting_at: null })).toBe(false);
  });
});
