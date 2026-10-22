import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CompleteDocumentUploadResponseV1,
  ListDocumentsResponseV1,
  PrepareDocumentUploadResponseV1,
  SourceDocumentV1,
  UploadQuotaResponseV1,
} from "@hiveforyou/contracts/documents/v1";

import { parseUploadProductPolicyV1 } from "@/lib/documents/upload-policy";
import { CORRELATION_HEADER } from "@/lib/server/correlation";

const INVOKE_TIMEOUT_MS = 12_000;

export type DocumentEdgeFailure = {
  error_code: string;
  message_safe: string;
  retryable: boolean;
  diagnostic_detail: string;
};

export type DocumentEdgeResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: DocumentEdgeFailure };

function functionName(): string {
  return process.env.SUPABASE_DOCUMENT_EDGE_FUNCTION?.trim() || "v1-documents";
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

function parseFailureBody(body: unknown): DocumentEdgeFailure | null {
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

async function readFunctionsHttpErrorBody(error: unknown): Promise<unknown> {
  if (typeof error !== "object" || !error || !("context" in error)) {
    return undefined;
  }
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    try {
      const text = await context.text();
      if (!text.trim()) {
        return undefined;
      }
      return JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  }
  if (context && typeof context === "object" && "body" in context) {
    return (context as { body?: unknown }).body;
  }
  return undefined;
}

function parseDocument(value: unknown): SourceDocumentV1 | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.hive_id !== "string" ||
    typeof row.client_request_id !== "string" ||
    typeof row.filename !== "string" ||
    typeof row.mime_type !== "string" ||
    typeof row.byte_size !== "number" ||
    typeof row.status !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    hive_id: row.hive_id,
    client_request_id: row.client_request_id,
    filename: row.filename,
    mime_type: row.mime_type,
    byte_size: row.byte_size,
    sha256: row.sha256 === null || typeof row.sha256 === "string" ? row.sha256 : null,
    status: row.status as SourceDocumentV1["status"],
    created_at: row.created_at,
    registered_at:
      row.registered_at === null || typeof row.registered_at === "string"
        ? row.registered_at
        : null,
  };
}

async function invoke<T>(
  client: SupabaseClient,
  correlationId: string,
  body: Record<string, unknown>,
  parse: (record: Record<string, unknown>) => T | null,
): Promise<DocumentEdgeResult<T>> {
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
      const contextBody = await readFunctionsHttpErrorBody(error);
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

    const parsed = parse(record);
    if (!parsed) {
      return {
        ok: false,
        error: {
          error_code: "DEPENDENCY_UNAVAILABLE",
          message_safe: "Something went wrong. Please try again.",
          retryable: true,
          diagnostic_detail: "invalid_edge_payload",
        },
      };
    }
    return { ok: true, data: parsed };
  } catch (thrown) {
    const isTimeout =
      thrown instanceof Error &&
      (thrown.name === "AbortError" || thrown.message === "edge_invoke_timeout");
    return {
      ok: false,
      error: {
        error_code: isTimeout ? "DB_OUTCOME_UNKNOWN" : "DEPENDENCY_UNAVAILABLE",
        message_safe: isTimeout
          ? "We could not confirm whether your upload finished. Try again with the same request."
          : "Something went wrong. Please try again.",
        retryable: true,
        diagnostic_detail: isTimeout ? "timeout" : "edge_invoke_thrown",
      },
    };
  }
}

export async function edgeGetUploadQuota(
  client: SupabaseClient,
  correlationId: string,
): Promise<DocumentEdgeResult<UploadQuotaResponseV1>> {
  return invoke(client, correlationId, { op: "quota" }, (record) => {
    const quota = record.quota;
    if (!quota || typeof quota !== "object") {
      return null;
    }
    const q = quota as Record<string, unknown>;
    if (
      typeof q.used !== "number" ||
      typeof q.limit !== "number" ||
      typeof q.remaining !== "number" ||
      typeof q.month_start_utc !== "string" ||
      typeof q.month_end_utc !== "string"
    ) {
      return null;
    }
    const policy =
      parseUploadProductPolicyV1(record.policy) ??
      parseUploadProductPolicyV1((q as Record<string, unknown>).policy);
    if (!policy) {
      return null;
    }
    return {
      quota: {
        used: q.used,
        limit: q.limit,
        remaining: q.remaining,
        month_start_utc: q.month_start_utc,
        month_end_utc: q.month_end_utc,
      },
      policy,
    };
  });
}

export async function edgeListDocuments(
  client: SupabaseClient,
  correlationId: string,
  hiveId: string,
): Promise<DocumentEdgeResult<ListDocumentsResponseV1>> {
  return invoke(client, correlationId, { op: "list", hive_id: hiveId }, (record) => {
    const raw = record.documents;
    const documents = Array.isArray(raw)
      ? raw.map(parseDocument).filter((doc): doc is SourceDocumentV1 => doc !== null)
      : [];
    return { documents };
  });
}

export async function edgePrepareDocumentUpload(
  client: SupabaseClient,
  correlationId: string,
  hiveId: string,
  input: {
    client_request_id: string;
    filename: string;
    mime_type: string;
    byte_size: number;
  },
): Promise<DocumentEdgeResult<PrepareDocumentUploadResponseV1>> {
  return invoke(
    client,
    correlationId,
    {
      op: "prepare",
      hive_id: hiveId,
      client_request_id: input.client_request_id,
      filename: input.filename,
      mime_type: input.mime_type,
      byte_size: input.byte_size,
    },
    (record) => {
      const prepare = record.prepare;
      const upload = record.upload;
      if (!prepare || typeof prepare !== "object" || !upload || typeof upload !== "object") {
        return null;
      }
      const p = prepare as Record<string, unknown>;
      const u = upload as Record<string, unknown>;
      if (
        typeof p.document_id !== "string" ||
        typeof p.storage_path !== "string" ||
        typeof p.status !== "string" ||
        typeof p.byte_size !== "number" ||
        typeof p.mime_type !== "string" ||
        typeof p.filename !== "string" ||
        typeof p.replayed !== "boolean" ||
        typeof u.bucket !== "string" ||
        typeof u.path !== "string" ||
        typeof u.signed_url !== "string" ||
        typeof u.token !== "string"
      ) {
        return null;
      }
      return {
        prepare: {
          document_id: p.document_id,
          storage_path: p.storage_path,
          status: p.status,
          byte_size: p.byte_size,
          mime_type: p.mime_type,
          filename: p.filename,
          replayed: p.replayed,
        },
        upload: {
          bucket: u.bucket,
          path: u.path,
          signed_url: u.signed_url,
          token: u.token,
        },
      };
    },
  );
}

export async function edgeCompleteDocumentUpload(
  client: SupabaseClient,
  correlationId: string,
  hiveId: string,
  input: { client_request_id: string; sha256: string; byte_size: number },
): Promise<DocumentEdgeResult<CompleteDocumentUploadResponseV1>> {
  return invoke(
    client,
    correlationId,
    {
      op: "complete",
      hive_id: hiveId,
      client_request_id: input.client_request_id,
      sha256: input.sha256,
      byte_size: input.byte_size,
    },
    (record) => {
      const complete = record.complete;
      if (!complete || typeof complete !== "object") {
        return null;
      }
      const c = complete as Record<string, unknown>;
      if (
        typeof c.document_id !== "string" ||
        typeof c.status !== "string" ||
        typeof c.replayed !== "boolean"
      ) {
        return null;
      }
      return {
        complete: {
          document_id: c.document_id,
          status: c.status,
          registered_at:
            c.registered_at === null || typeof c.registered_at === "string"
              ? c.registered_at
              : null,
          replayed: c.replayed,
        },
      };
    },
  );
}

export async function edgeAbortDocumentUpload(
  client: SupabaseClient,
  correlationId: string,
  hiveId: string,
  input: { client_request_id: string; reason?: "abandoned" | "failed" },
): Promise<DocumentEdgeResult<{ document_id: string; status: string }>> {
  return invoke(
    client,
    correlationId,
    {
      op: "abort",
      hive_id: hiveId,
      client_request_id: input.client_request_id,
      reason: input.reason,
    },
    (record) => {
      const abort = record.abort;
      if (!abort || typeof abort !== "object") {
        return null;
      }
      const a = abort as Record<string, unknown>;
      if (typeof a.document_id !== "string" || typeof a.status !== "string") {
        return null;
      }
      return { document_id: a.document_id, status: a.status };
    },
  );
}
