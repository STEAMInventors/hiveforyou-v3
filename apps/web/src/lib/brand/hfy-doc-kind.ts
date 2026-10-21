/** Maps citation label / filename to HiveForYou CSS `data-doc` chip icons. */
export type HfyDocKind =
  | "iep"
  | "eval"
  | "eligibility"
  | "progress"
  | "plan"
  | "notice"
  | "letter"
  | "statement"
  | "doc";

export function inferHfyDocKind(text: string): HfyDocKind {
  const s = text.toLowerCase();
  if (/\biep\b/.test(s) || s.includes("individualized education")) {
    return "iep";
  }
  if (s.includes("eval") || s.includes("assessment") || s.includes("psycho")) {
    return "eval";
  }
  if (s.includes("eligib")) {
    return "eligibility";
  }
  if (s.includes("progress") || s.includes("report card")) {
    return "progress";
  }
  if (s.includes("behavior") || /\bbip\b/.test(s) || s.includes("service plan")) {
    return "plan";
  }
  if (s.includes("notice") || s.includes("prior written") || /\bpwn\b/.test(s)) {
    return "notice";
  }
  if (s.includes("letter") || s.includes("email")) {
    return "letter";
  }
  if (s.includes("statement") || s.includes("present level") || s.includes("plop")) {
    return "statement";
  }
  return "doc";
}
