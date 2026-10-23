export function logWorkerEvent(input: {
  level: "info" | "error" | "warn";
  message: string;
  correlation_id?: string;
  study_run_id?: string;
  route?: string;
  error_code?: string;
  retryable?: boolean;
  diagnostic_detail?: string;
  model_alias?: string;
  gateway_status?: number;
  duration_ms?: number;
  error_name?: string;
  cause_safe?: string;
  inngest_connect_state?: string;
}): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ service: "worker", ...input }));
}
