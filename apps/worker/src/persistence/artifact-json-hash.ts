import { createHash } from "node:crypto";

/** Deterministic SHA-256 of JSON-serialized payload (Gate 1 / P1.5 artifact rows). */
export function sha256JsonPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
