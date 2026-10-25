import canonicalize from "canonicalize";

/**
 * RFC 8785 JSON Canonicalization Scheme (JCS) — single serialization path for pack digests.
 */
export function serializePackJcs(value: unknown): string {
  const serialized = canonicalize(value);
  if (serialized === undefined) {
    throw new TypeError("Value is not JSON-serializable for JCS.");
  }
  return serialized;
}
