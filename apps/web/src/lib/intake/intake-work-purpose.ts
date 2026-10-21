export const PURPOSE_DESCRIBED_PLACEHOLDER =
  "Tell me a little about what you're working on...";

export function isDescribedIntentReady(draft: string): boolean {
  return draft.trim().length > 0;
}
