/**
 * SUPABASE DASHBOARD DEPLOYMENT ARTIFACT — Edge Function `v1-hives`
 *
 * Paste this entire file into Dashboard → Edge Functions → v1-hives → index.ts.
 * Self-contained (no `../_shared/` or relative imports). Canonical source:
 * `supabase/functions/v1-hives/index.ts` — keep behavior in sync manually.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-correlation-id",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function logEvent(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ service: "edge-v1-hives", ...fields }));
}

const HIVE_SOURCE_DOCUMENTS_BUCKET = "hive3-source-documents";

const LIST_PAGE_SIZE = 100;

type StorageListEntry = {
  name: string;
  id: string | null;
};

function joinPath(prefix: string, name: string): string {
  return prefix ? `${prefix}/${name}` : name;
}

async function listStorageObjectPaths(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  const folders: string[] = [prefix.replace(/\/+$/, "")];

  while (folders.length > 0) {
    const folder = folders.pop()!;
    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(folder, {
        limit: LIST_PAGE_SIZE,
        offset,
      });
      if (error) {
        throw new Error(`storage_list_failed:${error.message}`);
      }
      const entries = (data ?? []) as StorageListEntry[];
      if (entries.length === 0) {
        break;
      }
      for (const entry of entries) {
        const fullPath = joinPath(folder, entry.name);
        if (entry.id === null) {
          folders.push(fullPath);
        } else {
          paths.push(fullPath);
        }
      }
      if (entries.length < LIST_PAGE_SIZE) {
        break;
      }
      offset += LIST_PAGE_SIZE;
    }
  }

  return paths;
}

function mergeUniquePaths(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const group of groups) {
    for (const path of group) {
      const trimmed = path.trim();
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      merged.push(trimmed);
    }
  }
  return merged;
}

const REMOVE_BATCH_SIZE = 100;

async function removeStorageObjects(
  admin: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<void> {
  for (let index = 0; index < paths.length; index += REMOVE_BATCH_SIZE) {
    const batch = paths.slice(index, index + REMOVE_BATCH_SIZE);
    const { error } = await admin.storage.from(bucket).remove(batch);
    if (error) {
      throw new Error(`storage_remove_failed:${error.message}`);
    }
  }
}

async function verifyStoragePrefixEmpty(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<boolean> {
  const remaining = await listStorageObjectPaths(admin, bucket, prefix);
  return remaining.length === 0;
}

const DB_TIMEOUT_MS = 8000;
const STORAGE_TIMEOUT_MS = 30000;

type HiveJson = {
  id: string;
  name: string;
  description: string | null;
  client_request_id: string;
  created_at: string;
  updated_at: string;
  deleting_at: string | null;
};

type Operation =
  | { op: "list" }
  | { op: "get"; hive_id: string }
  | { op: "get_by_client_request_id"; client_request_id: string }
  | { op: "create"; name: string; description: string | null; client_request_id: string }
  | { op: "delete"; hive_id: string };

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
  if (op === "delete" && typeof record.hive_id === "string" && record.hive_id.trim()) {
    return { op: "delete", hive_id: record.hive_id.trim() };
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

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = DB_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("timeout"));
    }, timeoutMs);
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

function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error("misconfigured");
  }
  return createClient(url, serviceKey);
}

function mapRpcError(message: string): { error_code: string; message_safe: string; retryable: boolean } {
  if (/auth_required/i.test(message)) {
    return { error_code: "AUTH_FAILED", message_safe: "Sign in to continue.", retryable: false };
  }
  if (/hive_not_found|document_not_found/i.test(message)) {
    return {
      error_code: "NOT_FOUND",
      message_safe: "We could not find that Hive.",
      retryable: false,
    };
  }
  if (/access_denied/i.test(message)) {
    return {
      error_code: "ACCESS_DENIED",
      message_safe: "You do not have access to this Hive.",
      retryable: false,
    };
  }
  if (/storage_list_failed|storage_remove_failed/i.test(message)) {
    return {
      error_code: "STORAGE_UNAVAILABLE",
      message_safe: "Storage is temporarily unavailable. Please try again.",
      retryable: true,
    };
  }
  if (/storage_cleanup_incomplete/i.test(message)) {
    return {
      error_code: "STORAGE_UNAVAILABLE",
      message_safe: "We could not finish removing this Hive's files. Try again.",
      retryable: true,
    };
  }
  if (message === "timeout") {
    return {
      error_code: "DB_OUTCOME_UNKNOWN",
      message_safe: "We could not confirm whether your Hive was deleted. Try again.",
      retryable: true,
    };
  }
  return {
    error_code: "DEPENDENCY_UNAVAILABLE",
    message_safe: "Something went wrong. Please try again.",
    retryable: true,
  };
}

type BeginDeletionPayload = {
  hive_id?: string;
  owner_user_id?: string;
  storage_prefix?: string;
  storage_paths?: unknown;
};

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

async function deleteHiveWithCleanup(
  supabase: ReturnType<typeof createUserClient>,
  correlationId: string,
  hiveId: string,
): Promise<Response> {
  const { data: beginRaw, error: beginError } = await withTimeout(
    supabase.rpc("hive3_m1_begin_hive_deletion", { p_hive_id: hiveId }),
  );
  if (beginError) {
    throw beginError;
  }
  const begin = beginRaw as BeginDeletionPayload;
  const storagePrefix =
    typeof begin.storage_prefix === "string" ? begin.storage_prefix.trim() : "";
  const dbPaths = parseStringArray(begin.storage_paths);
  if (!storagePrefix) {
    throw new Error("begin_without_prefix");
  }

  logEvent({
    level: "info",
    correlation_id: correlationId,
    hive_id: hiveId,
    deletion_stage: "marked",
    error_code: "HIVE_DELETE_BEGIN",
  });

  const admin = createServiceClient();
  let listedPaths: string[] = [];
  try {
    listedPaths = await withTimeout(
      listStorageObjectPaths(admin, HIVE_SOURCE_DOCUMENTS_BUCKET, storagePrefix),
      STORAGE_TIMEOUT_MS,
    );
  } catch (storageError) {
    const message = storageError instanceof Error ? storageError.message : String(storageError);
    logEvent({
      level: "error",
      correlation_id: correlationId,
      hive_id: hiveId,
      deletion_stage: "storage_list",
      error_code: "STORAGE_UNAVAILABLE",
      diagnostic_detail: message.slice(0, 200),
    });
    throw storageError;
  }

  const pathsToRemove = mergeUniquePaths(dbPaths, listedPaths);
  if (pathsToRemove.length > 0) {
    try {
      await withTimeout(
        removeStorageObjects(admin, HIVE_SOURCE_DOCUMENTS_BUCKET, pathsToRemove),
        STORAGE_TIMEOUT_MS,
      );
    } catch (storageError) {
      const message = storageError instanceof Error ? storageError.message : String(storageError);
      logEvent({
        level: "error",
        correlation_id: correlationId,
        hive_id: hiveId,
        deletion_stage: "storage_remove",
        error_code: "STORAGE_UNAVAILABLE",
        diagnostic_detail: message.slice(0, 200),
      });
      throw storageError;
    }
  }

  const empty = await withTimeout(
    verifyStoragePrefixEmpty(admin, HIVE_SOURCE_DOCUMENTS_BUCKET, storagePrefix),
    STORAGE_TIMEOUT_MS,
  );
  if (!empty) {
    logEvent({
      level: "error",
      correlation_id: correlationId,
      hive_id: hiveId,
      deletion_stage: "storage_verify",
      error_code: "STORAGE_UNAVAILABLE",
      diagnostic_detail: "storage_cleanup_incomplete",
    });
    throw new Error("storage_cleanup_incomplete");
  }

  logEvent({
    level: "info",
    correlation_id: correlationId,
    hive_id: hiveId,
    deletion_stage: "storage_verified",
    error_code: "HIVE_DELETE_STORAGE_OK",
  });

  const { data: completeRaw, error: completeError } = await withTimeout(
    admin.rpc("hive3_m1_complete_hive_deletion", { p_hive_id: hiveId }),
  );
  if (completeError) {
    throw completeError;
  }
  const complete = completeRaw as { deleted?: boolean } | null;
  if (!complete?.deleted) {
    throw new Error("db_finalize_failed");
  }

  logEvent({
    level: "info",
    correlation_id: correlationId,
    hive_id: hiveId,
    deletion_stage: "completed",
    error_code: "HIVE_DELETE_OK",
  });

  return jsonResponse({ deleted: true });
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

    if (operation.op === "delete") {
      return await deleteHiveWithCleanup(supabase, correlationId, operation.hive_id);
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
    const mapped = mapRpcError(message);
    const fallbackCode =
      message === "timeout"
        ? "DB_OUTCOME_UNKNOWN"
        : /23505|duplicate|unique/i.test(message)
          ? "INVALID_REQUEST"
          : /42501|permission|policy/i.test(message)
            ? "ACCESS_DENIED"
            : mapped.error_code;
    const error_code = mapped.error_code !== "DEPENDENCY_UNAVAILABLE" ? mapped.error_code : fallbackCode;
    const message_safe =
      error_code === "ACCESS_DENIED"
        ? "You do not have access to this Hive."
        : error_code === "DB_OUTCOME_UNKNOWN"
          ? "We could not confirm whether your Hive was deleted. Try again."
          : mapped.message_safe;
    const retryable =
      mapped.retryable || message === "timeout" || /network|fetch/i.test(message);
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
        message_safe,
        retryable,
      },
      error_code === "INVALID_REQUEST" || error_code === "NOT_FOUND" ? 400 : 503,
    );
  }
});
