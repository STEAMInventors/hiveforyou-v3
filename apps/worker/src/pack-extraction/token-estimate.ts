/** Conservative UTF-8 byte → token estimate (over-counts vs typical English tokenizers). */
export function estimatePromptTokensFromBytes(byteLength: number): number {
  if (byteLength <= 0) {
    return 0;
  }
  return Math.ceil(byteLength / 3);
}
