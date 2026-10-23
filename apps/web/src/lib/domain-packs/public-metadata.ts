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

export type DomainPackPublicMetadata = {
  contract_version: "domain-pack-public-metadata@1";
  domains: DomainPackPublicDomain[];
};

const metadata = generated as DomainPackPublicMetadata;

export function listPublicDomainPacks(): DomainPackPublicDomain[] {
  return metadata.domains;
}

export function getPublicDomainPack(domainId: string): DomainPackPublicDomain | undefined {
  return metadata.domains.find((entry) => entry.domain_id === domainId);
}
