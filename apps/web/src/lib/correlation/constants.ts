export const CORRELATION_HEADER = "x-correlation-id";

export function resolveCorrelationId(incoming: string | null): string {
  const trimmed = incoming?.trim();
  if (trimmed && trimmed.length <= 128) {
    return trimmed;
  }
  return crypto.randomUUID();
}
