export type PackPromptCompileIssueCode =
  | "PACK_NOT_REVIEWED"
  | "UNSUPPORTED_CONTRACT_VERSION"
  | "CATALOG_INCOMPLETE"
  | "CHECKLIST_UNRESOLVED"
  | "PROMPT_COMPILE_FAILED"
  | "PROMPT_TOO_LARGE"
  | "CANONICALIZATION_FAILED";

export type PackPromptCompileIssue = {
  code: PackPromptCompileIssueCode;
  message: string;
  document_type_id?: string;
  record_type_id?: string;
  fact_id?: string;
};

export class PackPromptCompileError extends Error {
  constructor(
    message: string,
    readonly issues: PackPromptCompileIssue[],
  ) {
    super(message);
    this.name = "PackPromptCompileError";
  }
}
