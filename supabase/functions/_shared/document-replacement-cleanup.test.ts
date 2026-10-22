import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  runReplacementStorageCleanup,
  supersededStoragePathForCleanup,
} from "./document-replacement-cleanup.ts";

Deno.test("supersededStoragePathForCleanup ignores missing or new registered path", () => {
  assertEquals(
    supersededStoragePathForCleanup({}, "user/hive/new/file.pdf"),
    null,
  );
  assertEquals(
    supersededStoragePathForCleanup(
      { superseded_storage_path: "user/hive/new/file.pdf" },
      "user/hive/new/file.pdf",
    ),
    null,
  );
  assertEquals(
    supersededStoragePathForCleanup(
      { superseded_storage_path: " user/hive/old/file.pdf " },
      "user/hive/new/file.pdf",
    ),
    "user/hive/old/file.pdf",
  );
});

Deno.test("runReplacementStorageCleanup succeeds when storage absent after remove", async () => {
  const removed: string[] = [];
  const result = await runReplacementStorageCleanup("path/old.pdf", {
    removeStorageObjects: async (paths) => {
      removed.push(...paths);
    },
    verifyStorageObjectAbsent: async () => true,
  });
  assertEquals(result.ok, true);
  assertEquals(removed, ["path/old.pdf"]);
});

Deno.test("runReplacementStorageCleanup fails when object still present", async () => {
  const result = await runReplacementStorageCleanup("path/old.pdf", {
    removeStorageObjects: async () => {},
    verifyStorageObjectAbsent: async () => false,
  });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error_code, "STORAGE_UNAVAILABLE");
    assertEquals(result.retryable, true);
  }
});

Deno.test("runReplacementStorageCleanup replay is idempotent when already absent", async () => {
  let removeCalls = 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await runReplacementStorageCleanup("path/old.pdf", {
      removeStorageObjects: async () => {
        removeCalls += 1;
      },
      verifyStorageObjectAbsent: async () => true,
    });
    assertEquals(result.ok, true);
  }
  assertEquals(removeCalls, 2);
});
