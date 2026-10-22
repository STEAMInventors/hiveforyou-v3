/** Shared P2.2 reasoning alias configuration (classify/plan/extract at runtime). */

export function workerReasoningAliasConfigured(): boolean {
  return Boolean(process.env.WORKER_P2_REASONING_LITELLM_ALIAS?.trim());
}

export function readerReasoningAliasEnvName(): string {
  return "READER_P2_REASONING_LITELLM_ALIAS";
}
