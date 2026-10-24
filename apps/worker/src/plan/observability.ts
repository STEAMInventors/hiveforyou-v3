export type PlanningLogEvent = {
  level: "info" | "error";
  stage: "classify" | "plan_schema";
  correlation_id: string | null;
  study_run_id: string | null;
  source_document_id?: string;
  classification_quality?: string;
  domain_id?: string | null;
  document_type_id?: string | null;
  ambiguity_count?: number;
  match_tier?: string;
  pack_digest?: string | null;
  schema_hash?: string;
  model_alias?: string | null;
  duration_ms: number;
  error_code?: string;
  retryable?: boolean;
  message_safe?: string;
  failure_reason?: string;
  /** Safe invalid-key category from planning diagnostics; never raw field keys. */
  field_key_category?: string;
  validation_boundary?: string;
  evidence_flag_kind?: string;
};

/** Sanitized planning log. Never include prompts, page text, or model completions. */
export function emitPlanningLog(event: PlanningLogEvent): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "worker",
    ...event,
  });
  if (event.level === "error") {
    console.error(line);
    return;
  }
  console.info(line);
}
