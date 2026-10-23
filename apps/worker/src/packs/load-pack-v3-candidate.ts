import { readFileSync, statSync } from "node:fs";

import {
  parseDomainPackManifestV3,
  type DomainPackManifestV3,
} from "@hiveforyou/contracts/domain-packs/v3";
import { computePackDigest, validateDomainPackManifestV3 } from "@hiveforyou/core";

export type LoadedDomainPackV3Candidate = {
  manifest: DomainPackManifestV3;
  digest: string;
  manifestPath: string;
};

export function resolveIepV3CandidateManifestPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const path = env.WORKER_DEV_IEP_V3_MANIFEST_PATH?.trim();
  return path && statSync(path, { throwIfNoEntry: false })?.isFile() ? path : null;
}

export function loadIepV3CandidateIfPinned(
  env: NodeJS.ProcessEnv = process.env,
): LoadedDomainPackV3Candidate | null {
  const manifestPath = resolveIepV3CandidateManifestPath(env);
  if (!manifestPath) {
    return null;
  }
  if (env.WORKER_DEV_IEP_V3_ENABLED?.trim() !== "1") {
    return null;
  }
  const bytes = readFileSync(manifestPath, "utf8");
  const parsed = parseDomainPackManifestV3(JSON.parse(bytes));
  if (!parsed.ok) {
    throw new Error(parsed.message);
  }
  validateDomainPackManifestV3(parsed.value, {
    manifestBytes: Buffer.byteLength(bytes, "utf8"),
    productionSelection: false,
  });
  return {
    manifest: parsed.value,
    digest: computePackDigest(bytes),
    manifestPath,
  };
}
