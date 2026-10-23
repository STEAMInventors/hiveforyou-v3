import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  catalogHasBlockingDiagnostics,
  computePackDigest,
  normalizeDomainPackManifest,
  parsePackManifest,
  resolvePackCatalog,
  type LoadedPackBytes,
  type PackCatalogDiagnostics,
  type ResolvedDomainPack,
  type ResolvePackCatalogOptions,
} from "@hiveforyou/core";

export type LoadedDomainPackV1 = {
  manifest: ResolvedDomainPack["manifest"];
  digest: string;
  manifestPath: string;
};

export type LoadDomainPacksResult = {
  packs: LoadedDomainPackV1[];
  diagnostics: PackCatalogDiagnostics[];
};

function readAllManifestBytes(rootDir: string): LoadedPackBytes[] {
  const loaded: LoadedPackBytes[] = [];
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
        if (!statSync(manifestPath, { throwIfNoEntry: false })?.isFile()) {
          continue;
        }
        loaded.push({
          manifestPath,
          bytes: readFileSync(manifestPath, "utf8"),
        });
      } catch {
        // unreadable path; catalog resolution will surface diagnostics
      }
    }
  }
  return loaded;
}

export function loadDomainPacksFromRoot(
  rootDir: string,
  options: ResolvePackCatalogOptions = {},
): LoadDomainPacksResult {
  const resolved = resolvePackCatalog(readAllManifestBytes(rootDir), options);
  return {
    packs: resolved.packs.map((entry) => ({
      manifest: entry.manifest,
      digest: entry.digest,
      manifestPath: entry.manifestPath,
    })),
    diagnostics: resolved.diagnostics,
  };
}

export function loadDomainPacksOrThrow(
  rootDir: string,
  options: ResolvePackCatalogOptions = {},
): LoadedDomainPackV1[] {
  const result = loadDomainPacksFromRoot(rootDir, options);
  if (catalogHasBlockingDiagnostics(result.diagnostics, options.requiredPackIds)) {
    const first = result.diagnostics[0];
    throw new Error(first?.message ?? "Domain pack catalog failed validation.");
  }
  return result.packs;
}

/** @deprecated Prefer loadDomainPacksFromRoot for diagnostics-aware loading. */
export function loadDomainPacksLegacy(rootDir: string): LoadedDomainPackV1[] {
  const loaded: LoadedDomainPackV1[] = [];
  for (const entry of readAllManifestBytes(rootDir)) {
    try {
      const manifest = normalizeDomainPackManifest(parsePackManifest(JSON.parse(entry.bytes)));
      loaded.push({
        manifest,
        digest: computePackDigest(entry.bytes),
        manifestPath: entry.manifestPath,
      });
    } catch {
      // Skip invalid pack directories; caller logs at orchestration time.
    }
  }
  return loaded;
}
