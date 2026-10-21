import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

import { corsHeaders, jsonResponse } from "../_shared/http.ts";

const DB_TIMEOUT_MS = 8000;
const STORAGE_BUCKET = "hive3-source-documents";

type Operation =
  | { op: "quota" }
  | { op: "list"; hive_id: string }
  | {
      op: "prepare";
      hive_id: string;
      client_request_id: string;
      filename: string;
      mime_type: string;
      byte_size: number;
    }
  | {
      op: "complete";
      hive_id: string;
      client_request_id: string;
      sha256: string;
      byte_size: number;
    }
  | {
      op: "abort";
      hive_id: string;
      client_request_id: string;
      reason?: "abandoned" | "failed";
    };

function parseOperation(body: unknown): Operation | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const record = body as Record<string, unknown>;
  const op = record.op;
  if (op === "quota") {
    return { op: "quota" };
  }
  if (op === "list" && typeof record.hive_id === "string" && record.hive_id.trim()) {
    return { op: "list", hive_id: record.hive_id.trim() };
  }
  if (
    op === "prepare" &&
    typeof record.hive_id === "string" &&
    record.hive_id.trim() &&
    typeof record.client_request_id === "string" &&
    record.client_request_id.trim() &&
    typeof record.filename === "string" &&
    typeof record.mime_type === "string" &&
    typeof record.byte_size === "number" &&
    Number.isFinite(record.byte_size)
  ) {
    return {
      op: "prepare",
      hive_id: record.hive_id.trim(),
      client_request_id: record.client_request_id.trim(),
      filename: record.filename,
      mime_type: record.mime_type,
      byte_size: record.byte_size,
    };
  }
  if (
    op === "complete" &&
    typeof record.hive_id === "string" &&
    record.hive_id.trim() &&
    typeof record.client_request_id === "string" &&
    record.client_request_id.trim() &&
    typeof record.sha256 === "string" &&
    typeof record.byte_size === "number" &&
    Number.isFinite(record.byte_size)
  ) {
    return {
      op: "complete",
      hive_id: record.hive_id.trim(),
      client_request_id: record.client_request_id.trim(),
      sha256: record.sha256.trim(),
      byte_size: record.byte_size,
    };
  }
  if (
    op === "abort" &&
    typeof record.hive_id === "string" &&
    record.hive_id.trim() &&
    typeof record.client_request_id === "string" &&
    record.client_request_id.trim()
  ) {
    const reason = record.reason === "failed" ? "failed" : "abandoned";
    return {
      op: "abort",
      hive_id: record.hive_id.trim(),
      client_request_id: record.client_request_id.trim(),
      reason,
    };
  }
  return null;
}

function logEvent(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ service: "edge-v1-documents", ...fields }));
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
  if (/quota_exceeded/i.test(message)) {
    return {
      error_code: "QUOTA_EXCEEDED",
      message_safe: "You have used all 10 document uploads for this month (UTC).",
      retryable: false,
    };
  }
  if (/hive_not_found|document_not_found/i.test(message)) {
    return {
      error_code: "NOT_FOUND",
      message_safe: "We could not find that document or Hive.",
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
  if (/invalid_|byte_size_mismatch/i.test(message)) {
    return {
      error_code: "INVALID_REQUEST",
      message_safe: "This file cannot be uploaded. Check type and size (max 25 MB).",
      retryable: false,
    };
  }
  if (message === "timeout") {
    return {
      error_code: "DB_OUTCOME_UNKNOWN",
      message_safe: "We could not confirm whether your upload finished. Try again with the same request.",
      retryable: true,
    };
  }
  return {
    error_code: "DEPENDENCY_UNAVAILABLE",
    message_safe: "Something went wrong. Please try again.",
    retryable: true,
  };
}

async function verifyStorageObject(
  storagePath: string,
  expectedBytes: number,
): Promise<{ ok: true } | { ok: false; error_code: string; message_safe: string }> {
  const admin = createServiceClient();
  const folder = storagePath.split("/").slice(0, -1).join("/");
  const name = storagePath.split("/").pop() ?? "";
  const { data, error } = await admin.storage.from(STORAGE_BUCKET).list(folder, {
    search: name,
    limit: 1,
  });
  if (error) {
    return {
      ok: false,
      error_code: "STORAGE_UNAVAILABLE",
      message_safe: "Storage is temporarily unavailable. Please try again.",
    };
  }
  const match = data?.find((entry) => entry.name === name);
  if (!match) {
    return {
      ok: false,
      error_code: "STORAGE_NOT_FOUND",
      message_safe: "The file did not finish uploading. Try again.",
    };
  }
  const size = match.metadata?.size;
  if (typeof size === "number" && size !== expectedBytes) {
    return {
      ok: false,
      error_code: "INVALID_REQUEST",
      message_safe: "Uploaded file size did not match. Try again.",
    };
  }
  return { ok: true };
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
    operation = parseOperation(await req.json());
  } catch {
    operation = null;
  }
  if (!operation) {
    return jsonResponse(
      { error_code: "INVALID_REQUEST", message_safe: "Invalid document operation.", retryable: false },
      400,
    );
  }

  try {
    const supabase = createUserClient(authHeader);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse(
        { error_code: "AUTH_FAILED", message_safe: "Sign in to continue.", retryable: false },
        401,
      );
    }

    if (operation.op === "quota") {
      const { data, error } = await withTimeout(supabase.rpc("hive3_m1_get_upload_quota"));
      if (error) {
        throw error;
      }
      return jsonResponse({ quota: data });
    }

    if (operation.op === "list") {
      const { data, error } = await withTimeout(
        supabase.rpc("hive3_m1_list_source_documents", { p_hive_id: operation.hive_id }),
      );
      if (error) {
        throw error;
      }
      return jsonResponse({ documents: data ?? [] });
    }

    if (operation.op === "prepare") {
      const { data, error } = await withTimeout(
        supabase.rpc("hive3_m1_prepare_source_document_upload", {
          p_hive_id: operation.hive_id,
          p_client_request_id: operation.client_request_id,
          p_filename: operation.filename,
          p_mime_type: operation.mime_type,
          p_byte_size: operation.byte_size,
        }),
      );
      if (error) {
        throw error;
      }
      const row = data as Record<string, unknown>;
      const storagePath = typeof row.storage_path === "string" ? row.storage_path : null;
      if (!storagePath) {
        throw new Error("prepare_without_path");
      }
      if (row.status === "registered") {
        return jsonResponse({
          prepare: row,
          upload: {
            bucket: STORAGE_BUCKET,
            path: storagePath,
            signed_url: "",
            token: "",
          },
        });
      }
      const admin = createServiceClient();
      const signed = await admin.storage.from(STORAGE_BUCKET).createSignedUploadUrl(storagePath);
      if (signed.error || !signed.data?.signedUrl) {
        throw signed.error ?? new Error("signed_url_failed");
      }
      return jsonResponse({
        prepare: row,
        upload: {
          bucket: STORAGE_BUCKET,
          path: storagePath,
          signed_url: signed.data.signedUrl,
          token: signed.data.token,
        },
      });
    }

    if (operation.op === "complete") {
      const { data: targetRow, error: targetError } = await withTimeout(
        supabase.rpc("hive3_m1_get_source_document_upload", {
          p_hive_id: operation.hive_id,
          p_client_request_id: operation.client_request_id,
        }),
      );
      if (targetError) {
        throw targetError;
      }
      const target = targetRow as Record<string, unknown> | null;
      const storagePath =
        target && typeof target.storage_path === "string" ? target.storage_path : null;
      const status = target && typeof target.status === "string" ? target.status : null;
      if (!storagePath) {
        throw new Error("document_not_found");
      }
      if (status !== "registered") {
        const storageOk = await verifyStorageObject(storagePath, operation.byte_size);
        if (!storageOk.ok) {
          return jsonResponse(
            {
              error_code: storageOk.error_code,
              message_safe: storageOk.message_safe,
              retryable: storageOk.error_code === "STORAGE_UNAVAILABLE",
            },
            storageOk.error_code === "STORAGE_NOT_FOUND" ? 400 : 503,
          );
        }
      }
      const { data, error } = await withTimeout(
        supabase.rpc("hive3_m1_complete_source_document_upload", {
          p_hive_id: operation.hive_id,
          p_client_request_id: operation.client_request_id,
          p_sha256: operation.sha256,
          p_byte_size: operation.byte_size,
        }),
      );
      if (error) {
        throw error;
      }
      return jsonResponse({ complete: data });
    }

    const { data, error } = await withTimeout(
      supabase.rpc("hive3_m1_abort_source_document_upload", {
        p_hive_id: operation.hive_id,
        p_client_request_id: operation.client_request_id,
        p_reason: operation.reason ?? "abandoned",
      }),
    );
    if (error) {
      throw error;
    }
    return jsonResponse({ abort: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const mapped = mapRpcError(message);
    logEvent({
      level: "error",
      correlation_id: correlationId,
      error_code: mapped.error_code,
      retryable: mapped.retryable,
      diagnostic_detail: message.slice(0, 200),
    });
    return jsonResponse(mapped, mapped.error_code === "INVALID_REQUEST" ? 400 : 503);
  }
});
