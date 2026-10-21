import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

import { corsHeaders, jsonResponse, logEvent } from "../_shared/http.ts";

const DB_TIMEOUT_MS = 8000;

type HiveJson = {
  id: string;
  name: string;
  description: string | null;
  client_request_id: string;
  created_at: string;
  updated_at: string;
};

type Operation =
  | { op: "list" }
  | { op: "get"; hive_id: string }
  | { op: "get_by_client_request_id"; client_request_id: string }
  | { op: "create"; name: string; description: string | null; client_request_id: string };

function parseOperation(body: unknown): Operation | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const record = body as Record<string, unknown>;
  const op = record.op;
  if (op === "list") {
    return { op: "list" };
  }
  if (op === "get" && typeof record.hive_id === "string" && record.hive_id.trim()) {
    return { op: "get", hive_id: record.hive_id.trim() };
  }
  if (
    op === "get_by_client_request_id" &&
    typeof record.client_request_id === "string" &&
    record.client_request_id.trim()
  ) {
    return { op: "get_by_client_request_id", client_request_id: record.client_request_id.trim() };
  }
  if (
    op === "create" &&
    typeof record.name === "string" &&
    typeof record.client_request_id === "string" &&
    record.client_request_id.trim()
  ) {
    const description =
      record.description === null || record.description === undefined
        ? null
        : typeof record.description === "string"
          ? record.description
          : null;
    return {
      op: "create",
      name: record.name,
      description,
      client_request_id: record.client_request_id.trim(),
    };
  }
  return null;
}

function mapHive(row: HiveJson | null): HiveJson | null {
  if (!row || typeof row !== "object") {
    return null;
  }
  return row;
}

async function withTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("timeout"));
    }, DB_TIMEOUT_MS);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function createUserClient(authHeader: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    throw new Error("misconfigured");
  }
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const correlationId = req.headers.get("x-correlation-id") ?? "unknown";
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    logEvent({ level: "warn", correlation_id: correlationId, error_code: "AUTH_FAILED" });
    return jsonResponse(
      { error_code: "AUTH_FAILED", message_safe: "Sign in to continue.", retryable: false },
      401,
    );
  }

  let operation: Operation | null = null;
  try {
    const body = await req.json();
    operation = parseOperation(body);
  } catch {
    operation = null;
  }
  if (!operation) {
    return jsonResponse(
      {
        error_code: "INVALID_REQUEST",
        message_safe: "Invalid Hive operation.",
        retryable: false,
      },
      400,
    );
  }

  try {
    const supabase = createUserClient(authHeader);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      logEvent({ level: "warn", correlation_id: correlationId, error_code: "AUTH_FAILED" });
      return jsonResponse(
        { error_code: "AUTH_FAILED", message_safe: "Sign in to continue.", retryable: false },
        401,
      );
    }

    if (operation.op === "list") {
      const { data, error } = await withTimeout(supabase.rpc("hive3_m1_list_hives"));
      if (error) {
        throw error;
      }
      const raw = data as unknown;
      const hives = (Array.isArray(raw) ? raw : []) as HiveJson[];
      return jsonResponse({ hives: hives.map((h) => mapHive(h)).filter(Boolean) });
    }

    if (operation.op === "get") {
      const { data, error } = await withTimeout(
        supabase.rpc("hive3_m1_get_hive", { p_hive_id: operation.hive_id }),
      );
      if (error) {
        throw error;
      }
      const hive = mapHive(data as HiveJson | null);
      return jsonResponse({ hive });
    }

    if (operation.op === "get_by_client_request_id") {
      const { data, error } = await withTimeout(
        supabase.rpc("hive3_m1_get_hive_by_client_request_id", {
          p_client_request_id: operation.client_request_id,
        }),
      );
      if (error) {
        throw error;
      }
      const hive = mapHive(data as HiveJson | null);
      return jsonResponse({ hive });
    }

    const { data, error } = await withTimeout(
      supabase.rpc("hive3_m1_insert_hive", {
        p_name: operation.name,
        p_description: operation.description,
        p_client_request_id: operation.client_request_id,
      }),
    );
    if (error) {
      throw error;
    }
    const hive = mapHive(data as HiveJson | null);
    if (!hive) {
      throw new Error("insert_without_row");
    }
    return jsonResponse({ hive });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = message === "timeout" || /network|fetch/i.test(message);
    const error_code =
      message === "timeout"
        ? "DB_OUTCOME_UNKNOWN"
        : /23505|duplicate|unique/i.test(message)
          ? "INVALID_REQUEST"
          : /42501|permission|policy/i.test(message)
            ? "ACCESS_DENIED"
            : "DEPENDENCY_UNAVAILABLE";
    logEvent({
      level: "error",
      correlation_id: correlationId,
      error_code,
      retryable,
      diagnostic_detail: message.slice(0, 200),
    });
    return jsonResponse(
      {
        error_code,
        message_safe:
          error_code === "ACCESS_DENIED"
            ? "You do not have access to this Hive."
            : error_code === "DB_OUTCOME_UNKNOWN"
              ? "We could not confirm whether your Hive was saved. Try again with the same request."
              : "Something went wrong. Please try again.",
        retryable,
      },
      error_code === "INVALID_REQUEST" ? 400 : 503,
    );
  }
});
