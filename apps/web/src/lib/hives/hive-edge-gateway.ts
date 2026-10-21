import type { SupabaseClient } from "@supabase/supabase-js";

import { CORRELATION_HEADER } from "@/lib/server/correlation";
const INVOKE_TIMEOUT_MS = 8000;

export type HiveRowPayload = {
  id: string;
  name: string;
  description: string | null;
  client_request_id: string;
  created_at: string;
  updated_at: string;
};

export type HiveEdgeSuccess =
  | { kind: "list"; hives: HiveRowPayload[] }
  | { kind: "hive"; hive: HiveRowPayload | null };

export type HiveEdgeFailure = {
  error_code: string;
  message_safe: string;
  retryable: boolean;
  diagnostic_detail: string;
};

export type HiveEdgeResult =
  | { ok: true; data: HiveEdgeSuccess }
  | { ok: false; error: HiveEdgeFailure };

function functionName(): string {
  return process.env.SUPABASE_HIVE_EDGE_FUNCTION?.trim() || "v1-hives";
}

async function accessToken(client: SupabaseClient): Promise<string | null> {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) {
    return null;
  }
  return data.session.access_token;
}

async function withTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error("edge_invoke_timeout");
      err.name = "AbortError";
      reject(err);
    }, INVOKE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function parseFailureBody(body: unknown): HiveEdgeFailure | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.error_code !== "string") {
    return null;
  }
  return {
    error_code: record.error_code,
    message_safe:
      typeof record.message_safe === "string"
        ? record.message_safe
        : "Something went wrong. Please try again.",
    retryable: record.retryable === true,
    diagnostic_detail: "edge_function",
  };
}

function parseHiveRow(value: unknown): HiveRowPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.name !== "string" ||
    typeof row.client_request_id !== "string" ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string"
  ) {
    return null;
  }
  const description =
    row.description === null || typeof row.description === "string" ? row.description : null;
  return {
    id: row.id,
    name: row.name,
    description,
    client_request_id: row.client_request_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function invoke(
  client: SupabaseClient,
  correlationId: string,
  body: Record<string, unknown>,
): Promise<HiveEdgeResult> {
  const token = await accessToken(client);
  if (!token) {
    return {
      ok: false,
      error: {
        error_code: "AUTH_FAILED",
        message_safe: "Sign in to continue.",
        retryable: false,
        diagnostic_detail: "no_session_token",
      },
    };
  }

  try {
    const { data, error } = await withTimeout(
      client.functions.invoke(functionName(), {
        body,
        headers: {
          Authorization: `Bearer ${token}`,
          [CORRELATION_HEADER]: correlationId,
        },
      }),
    );

    if (error) {
      const contextBody =
        typeof error === "object" && error && "context" in error
          ? (error as { context?: { body?: unknown } }).context?.body
          : undefined;
      const parsed = parseFailureBody(contextBody ?? data);
      if (parsed) {
        return { ok: false, error: parsed };
      }
      return {
        ok: false,
        error: {
          error_code: "DEPENDENCY_UNAVAILABLE",
          message_safe: "Something went wrong. Please try again.",
          retryable: true,
          diagnostic_detail: error.message ?? "edge_invoke_error",
        },
      };
    }

    if (!data || typeof data !== "object") {
      return {
        ok: false,
        error: {
          error_code: "DEPENDENCY_UNAVAILABLE",
          message_safe: "Something went wrong. Please try again.",
          retryable: true,
          diagnostic_detail: "empty_edge_payload",
        },
      };
    }

    const record = data as Record<string, unknown>;
    if (typeof record.error_code === "string") {
      const parsed = parseFailureBody(record);
      if (parsed) {
        return { ok: false, error: parsed };
      }
    }

    if (body.op === "list") {
      const raw = record.hives;
      const hives = Array.isArray(raw)
        ? raw.map(parseHiveRow).filter((row): row is HiveRowPayload => row !== null)
        : [];
      return { ok: true, data: { kind: "list", hives } };
    }

    const hive = parseHiveRow(record.hive);
    return { ok: true, data: { kind: "hive", hive } };
  } catch (thrown) {
    const isTimeout =
      thrown instanceof Error &&
      (thrown.name === "AbortError" || thrown.message === "edge_invoke_timeout");
    return {
      ok: false,
      error: {
        error_code: isTimeout ? "DB_OUTCOME_UNKNOWN" : "DEPENDENCY_UNAVAILABLE",
        message_safe: isTimeout
          ? "We could not confirm whether your Hive was saved. Try again with the same request."
          : "Something went wrong. Please try again.",
        retryable: true,
        diagnostic_detail: isTimeout ? "timeout" : "edge_invoke_thrown",
      },
    };
  }
}

export async function edgeListHives(
  client: SupabaseClient,
  correlationId: string,
): Promise<HiveEdgeResult> {
  return invoke(client, correlationId, { op: "list" });
}

export async function edgeGetHive(
  client: SupabaseClient,
  correlationId: string,
  hiveId: string,
): Promise<HiveEdgeResult> {
  return invoke(client, correlationId, { op: "get", hive_id: hiveId });
}

export async function edgeGetHiveByClientRequestId(
  client: SupabaseClient,
  correlationId: string,
  clientRequestId: string,
): Promise<HiveEdgeResult> {
  return invoke(client, correlationId, {
    op: "get_by_client_request_id",
    client_request_id: clientRequestId,
  });
}

export async function edgeInsertHive(
  client: SupabaseClient,
  correlationId: string,
  input: { name: string; description: string | null; client_request_id: string },
): Promise<HiveEdgeResult> {
  return invoke(client, correlationId, {
    op: "create",
    name: input.name,
    description: input.description,
    client_request_id: input.client_request_id,
  });
}
