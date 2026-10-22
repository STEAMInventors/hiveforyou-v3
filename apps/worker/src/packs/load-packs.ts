import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import type { DomainPackManifestV1 } from "@hiveforyou/contracts/domain-packs/v1";
import { computePackDigest, parsePackManifest } from "@hiveforyou/core";

export type LoadedDomainPackV1 = {
  manifest: DomainPackManifestV1;
  digest: string;
  manifestPath: string;
};

export function loadDomainPacksFromRoot(rootDir: string): LoadedDomainPackV1[] {
  const loaded: LoadedDomainPackV1[] = [];
  if (!statSync(rootDir, { throwIfNoEntry: false })?.isDirectory()) {
    return loaded;
  }

  for (const packId of readdirSync(rootDir)) {
    const packRoot = join(rootDir, packId);
    if (!statSync(packRoot).isDirectory()) {
      continue;
    }
    for (const versionDir of readdirSync(packRoot)) {
      const manifestPath = join(packRoot, versionDir, "manifest.json");
      try {
        const bytes = readFileSync(manifestPath, "utf8");
        const manifest = parsePackManifest(JSON.parse(bytes));
        loaded.push({
          manifest,
          digest: computePackDigest(bytes),
          manifestPath,
        });
      } catch {
        // Skip invalid pack directories; caller logs at orchestration time.
      }
    }
  }
  return loaded;
}
