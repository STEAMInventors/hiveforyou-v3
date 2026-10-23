import type { DomainPackManifestV1 } from "@hiveforyou/contracts/domain-packs/v1";
import {
  DOMAIN_PACK_MANIFEST_V2,
  type DomainPackManifestV2,
} from "@hiveforyou/contracts/domain-packs/v2";

import { normalizeDomainPackManifest, type NormalizedDomainPackManifest } from "./pack-normalize.js";
import { PackValidationError, parsePackManifest } from "./pack-validation.js";
import { computePackDigest } from "./schema-hash.js";

export type LoadedPackBytes = {
  manifestPath: string;
  bytes: string;
};

export type ResolvedDomainPack = {
  manifest: NormalizedDomainPackManifest;
  raw: DomainPackManifestV1 | DomainPackManifestV2;
  digest: string;
  manifestPath: string;
};

export type PackCatalogDiagnostics = {
  code:
    | "PACK_CORRUPT"
    | "PACK_NOT_REVIEWED"
    | "PACK_PIN_MISSING"
    | "PACK_PIN_MISMATCH"
    | "PACK_DUPLICATE_VERSION";
  pack_id: string;
  pack_version?: string;
  manifest_path?: string;
  message: string;
};

export type ResolvePackCatalogOptions = {
  reviewedOnly?: boolean;
  pins?: Record<string, string>;
  requiredPackIds?: string[];
};

export type ResolvePackCatalogResult = {
  packs: ResolvedDomainPack[];
  diagnostics: PackCatalogDiagnostics[];
};

function parseLoaded(entry: LoadedPackBytes): ResolvedDomainPack | PackCatalogDiagnostics {
  try {
    const raw = parsePackManifest(JSON.parse(entry.bytes));
    const manifest = normalizeDomainPackManifest(raw);
    return {
      manifest,
      raw,
      digest: computePackDigest(entry.bytes),
      manifestPath: entry.manifestPath,
    };
  } catch (error) {
    const message =
      error instanceof PackValidationError ? error.message : "Invalid pack manifest.";
    const packId = entry.manifestPath.split(/[/\\]/).slice(-3, -2)[0] ?? "unknown";
    return {
      code: "PACK_CORRUPT",
      pack_id: packId,
      manifest_path: entry.manifestPath,
      message,
    };
  }
}

export function resolvePackCatalog(
  loaded: LoadedPackBytes[],
  options: ResolvePackCatalogOptions = {},
): ResolvePackCatalogResult {
  const reviewedOnly = options.reviewedOnly !== false;
  const pins = options.pins ?? {};
  const required = new Set(options.requiredPackIds ?? []);
  const diagnostics: PackCatalogDiagnostics[] = [];
  const byPackId = new Map<string, ResolvedDomainPack[]>();

  for (const entry of loaded) {
    const parsed = parseLoaded(entry);
    if ("code" in parsed) {
      diagnostics.push(parsed);
      continue;
    }
    if (reviewedOnly && parsed.manifest.review_status !== "reviewed") {
      diagnostics.push({
        code: "PACK_NOT_REVIEWED",
        pack_id: parsed.manifest.pack_id,
        pack_version: parsed.manifest.pack_version,
        manifest_path: parsed.manifestPath,
        message: "Pack is not reviewed.",
      });
      continue;
    }
    const list = byPackId.get(parsed.manifest.pack_id) ?? [];
    list.push(parsed);
    byPackId.set(parsed.manifest.pack_id, list);
  }

  const packs: ResolvedDomainPack[] = [];
  for (const [packId, versions] of byPackId) {
    const pin = pins[packId];
    if (pin) {
      const matched = versions.filter((entry) => entry.manifest.pack_version === pin);
      if (matched.length === 0) {
        diagnostics.push({
          code: "PACK_PIN_MISMATCH",
          pack_id: packId,
          pack_version: pin,
          message: `Pinned version ${pin} is not loaded.`,
        });
        continue;
      }
      if (matched.length > 1) {
        diagnostics.push({
          code: "PACK_DUPLICATE_VERSION",
          pack_id: packId,
          pack_version: pin,
          message: "Duplicate pinned pack versions on disk.",
        });
      }
      packs.push(matched[0]!);
      continue;
    }

    const sorted = [...versions].sort((a, b) =>
      b.manifest.pack_version.localeCompare(a.manifest.pack_version, undefined, {
        numeric: true,
      }),
    );
    if (sorted.length > 1) {
      diagnostics.push({
        code: "PACK_PIN_MISSING",
        pack_id: packId,
        pack_version: sorted[0]?.manifest.pack_version,
        message: "Multiple pack versions loaded; pin pack_version explicitly.",
      });
    }
    if (sorted[0]) {
      packs.push(sorted[0]);
    }
  }

  for (const packId of required) {
    const hasPack = packs.some((entry) => entry.manifest.pack_id === packId);
    const corrupt = diagnostics.some(
      (entry) => entry.pack_id === packId && entry.code === "PACK_CORRUPT",
    );
    if (!hasPack && !corrupt) {
      diagnostics.push({
        code: "PACK_PIN_MISSING",
        pack_id: packId,
        message: "Required pack is missing from the catalog.",
      });
    }
  }

  return { packs, diagnostics };
}

export function catalogHasBlockingDiagnostics(
  diagnostics: PackCatalogDiagnostics[],
  requiredPackIds: string[] = [],
): boolean {
  const required = new Set(requiredPackIds);
  return diagnostics.some((entry) => {
    if (entry.code === "PACK_CORRUPT") {
      return true;
    }
    if (required.has(entry.pack_id) && entry.code !== "PACK_NOT_REVIEWED") {
      return true;
    }
    if (entry.code === "PACK_PIN_MISMATCH" && required.has(entry.pack_id)) {
      return true;
    }
    return false;
  });
}

export function projectPublicPackMetadata(packs: ResolvedDomainPack[]): {
  domains: {
    domain_id: string;
    pack_id: string;
    pack_version: string;
    label: string;
    short_label: string;
    executable: boolean;
    placeholder?: string;
    pill_tone?: string;
    starter_suggestions: { title: string; fill: string }[];
  }[];
} {
  const domains: {
    domain_id: string;
    pack_id: string;
    pack_version: string;
    label: string;
    short_label: string;
    executable: boolean;
    placeholder?: string;
    pill_tone?: string;
    starter_suggestions: { title: string; fill: string }[];
  }[] = [];

  for (const pack of packs) {
    const v2Surfaces =
      pack.raw.contract_version === DOMAIN_PACK_MANIFEST_V2
        ? (pack.raw as DomainPackManifestV2).public_surfaces
        : undefined;
    const surfaces =
      pack.manifest.public_surfaces ??
      v2Surfaces ??
      pack.manifest.domains.map((domain) => ({
        domain_id: domain.domain_id,
        label: domain.label,
        front_page: { executable: false },
      }));
    for (const surface of surfaces) {
      const frontPage = surface.front_page as {
        executable: boolean;
        placeholder?: string;
        pill_tone?: string;
      };
      const publicSurface = surface as DomainPackManifestV2["public_surfaces"][number];
      domains.push({
        domain_id: surface.domain_id,
        pack_id: pack.manifest.pack_id,
        pack_version: pack.manifest.pack_version,
        label: surface.label,
        short_label:
          publicSurface.short_label ?? surface.label.split("/")[0]?.trim() ?? surface.label,
        executable: frontPage.executable,
        placeholder: frontPage.placeholder,
        pill_tone: frontPage.pill_tone,
        starter_suggestions: publicSurface.starter_suggestions ?? [],
      });
    }
  }

  return { domains: domains.sort((a, b) => a.label.localeCompare(b.label)) };
}
