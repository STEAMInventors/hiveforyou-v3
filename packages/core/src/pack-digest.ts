import { createHash } from "node:crypto";

import { serializePackJcs } from "./pack-jcs.js";

export function computeSha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

export function computeSha256Digest(data: string): string {
  return `sha256:${computeSha256Hex(data)}`;
}

/** SHA-256 over JCS-serialized JSON (prefixed digest form used by pack-extraction refs). */
export function computeJcsSha256Digest(value: unknown): string {
  return computeSha256Digest(serializePackJcs(value));
}
