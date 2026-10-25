import generated from "./public-metadata.generated.json";

export type DomainPackPublicDomain = {
  domain_id: string;
  pack_id: string;
  pack_version: string;
  label: string;
  short_label: string;
  executable: boolean;
  placeholder?: string;
  pill_tone?: string;
  starter_suggestions: { title: string; fill: string }[];
};

/** Display labels for one reviewed Pack version, in manifest order. */
export type DomainPackDisplayLabels = {
  pack_id: string;
  pack_version: string;
  document_types: { id: string; label: string }[];
  record_types: { id: string; label: string; group: string | null }[];
};

export type DomainPackPublicMetadata = {
  contract_version: "domain-pack-public-metadata@1";
  domains: DomainPackPublicDomain[];
  packs: DomainPackDisplayLabels[];
};

const metadata = generated as DomainPackPublicMetadata;

export function listPublicDomainPacks(): DomainPackPublicDomain[] {
  return metadata.domains;
}

export function getPublicDomainPack(domainId: string): DomainPackPublicDomain | undefined {
  return metadata.domains.find((entry) => entry.domain_id === domainId);
}

/** Exact pin only: labels from another version could describe a different catalog. */
export function getDomainPackDisplayLabels(
  packId: string,
  packVersion: string,
): DomainPackDisplayLabels | undefined {
  return metadata.packs.find(
    (entry) => entry.pack_id === packId && entry.pack_version === packVersion,
  );
}
