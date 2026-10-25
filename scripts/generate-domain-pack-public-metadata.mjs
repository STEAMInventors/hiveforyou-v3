#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const packsRoot = join(repoRoot, "domain-packs");
const outPath = join(repoRoot, "apps", "web", "src", "lib", "domain-packs", "public-metadata.generated.json");

function loadBytes(rootDir) {
  const loaded = [];
  for (const packId of readdirSync(rootDir)) {
    const packRoot = join(rootDir, packId);
    if (!statSync(packRoot).isDirectory()) continue;
    for (const versionDir of readdirSync(packRoot)) {
      const manifestPath = join(packRoot, versionDir, "manifest.json");
      if (!statSync(manifestPath, { throwIfNoEntry: false })?.isFile()) continue;
      loaded.push({ manifestPath, bytes: readFileSync(manifestPath, "utf8") });
    }
  }
  return loaded;
}

// Minimal inline projection (avoids TS build step for web data generation).
function project(loaded) {
  const domains = [];
  const packs = [];
  for (const entry of loaded) {
    const manifest = JSON.parse(entry.bytes);
    if (manifest.review_status !== "reviewed") continue;
    // Display labels only (no match rules, fields, prompts or explainers); order follows the manifest.
    packs.push({
      pack_id: manifest.pack_id,
      pack_version: manifest.pack_version,
      document_types: (manifest.document_types ?? []).map((type) => ({
        id: type.document_type_id,
        label: type.label,
      })),
      record_types: (manifest.record_types ?? []).map((type) => ({
        id: type.record_type_id,
        label: type.label,
        group: type.group ?? null,
      })),
    });
    const surfaces = manifest.public_surfaces ?? [];
    for (const surface of surfaces) {
      domains.push({
        domain_id: surface.domain_id,
        pack_id: manifest.pack_id,
        pack_version: manifest.pack_version,
        label: surface.label,
        short_label: surface.short_label ?? surface.label,
        executable: surface.front_page?.executable ?? false,
        placeholder: surface.front_page?.placeholder,
        pill_tone: surface.front_page?.pill_tone,
        starter_suggestions: surface.starter_suggestions ?? [],
      });
    }
  }
  domains.sort((a, b) => a.label.localeCompare(b.label));
  packs.sort((a, b) =>
    a.pack_id === b.pack_id
      ? a.pack_version.localeCompare(b.pack_version)
      : a.pack_id.localeCompare(b.pack_id),
  );
  return { contract_version: "domain-pack-public-metadata@1", domains, packs };
}

const payload = project(loadBytes(packsRoot));
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath} (${payload.domains.length} domains, ${payload.packs.length} packs)`);
