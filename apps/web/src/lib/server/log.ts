import "server-only";

type LogLevel = "error" | "warn" | "info";

type ServerLogFields = {
  level: LogLevel;
  service: "web";
  correlation_id: string;
  route?: string;
  error_code?: string;
  retryable?: boolean;
  duration_ms?: number;
  diagnostic_detail?: string;
  hive_id?: string;
  deletion_stage?: string;
};

export function logServerEvent(fields: ServerLogFields): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...fields,
  });
  if (fields.level === "error") {
    console.error(line);
    return;
  }
  if (fields.level === "warn") {
    console.warn(line);
    return;
  }
  console.info(line);
}
