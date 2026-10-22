// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  HIVE_DELETE_CONFIRMATION_TEXT,
  isHiveDeleteConfirmed,
} from "./delete-hive-confirmation";

describe("hive delete confirmation", () => {
  it("requires exact lowercase delete", () => {
    expect(isHiveDeleteConfirmed(HIVE_DELETE_CONFIRMATION_TEXT)).toBe(true);
    expect(isHiveDeleteConfirmed("Delete")).toBe(false);
    expect(isHiveDeleteConfirmed("delete ")).toBe(false);
    expect(isHiveDeleteConfirmed("")).toBe(false);
  });
});
