// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

const hiveId = "11111111-1111-4111-8111-111111111111";

function clientWithSession() {
  return {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "token-123" } },
        error: null,
      })),
    },
    functions: { invoke },
  };
}

function functionsHttpError(context: Response, message = "Edge Function returned a non-2xx status code") {
  return { name: "FunctionsHttpError", message, context };
}

describe("document edge gateway invoke errors", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("preserves QUOTA_EXCEEDED from FunctionsHttpError response context", async () => {
    const client = clientWithSession();
    invoke.mockResolvedValue({
      data: null,
      error: functionsHttpError(
        new Response(
          JSON.stringify({
            error_code: "QUOTA_EXCEEDED",
            message_safe: "You have reached your monthly upload limit.",
            retryable: false,
          }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        ),
      ),
    });

    const { edgePrepareDocumentUpload } = await import("./document-edge-gateway");
    const result = await edgePrepareDocumentUpload(client as never, "corr-quota", hiveId, {
      client_request_id: "req-quota",
      filename: "report.pdf",
      mime_type: "application/pdf",
      byte_size: 1024,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.error_code).toBe("QUOTA_EXCEEDED");
      expect(result.error.message_safe).toBe("You have reached your monthly upload limit.");
      expect(result.error.retryable).toBe(false);
      expect(result.error.diagnostic_detail).toBe("edge_function");
    }
  });

  it("preserves other structured edge errors from response context", async () => {
    const client = clientWithSession();
    invoke.mockResolvedValue({
      data: null,
      error: functionsHttpError(
        new Response(
          JSON.stringify({
            error_code: "HIVE_NOT_FOUND",
            message_safe: "Hive not found.",
            retryable: false,
          }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
      ),
    });

    const { edgeListDocuments } = await import("./document-edge-gateway");
    const result = await edgeListDocuments(client as never, "corr-hive", hiveId);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.error_code).toBe("HIVE_NOT_FOUND");
      expect(result.error.message_safe).toBe("Hive not found.");
      expect(result.error.retryable).toBe(false);
    }
  });

  it("parses quota and policy from edge payload", async () => {
    const client = clientWithSession();
    invoke.mockResolvedValue({
      data: {
        quota: {
          used: 2,
          limit: 10,
          remaining: 8,
          month_start_utc: "2026-10-01T00:00:00.000Z",
          month_end_utc: "2026-11-01T00:00:00.000Z",
        },
        policy: {
          max_file_bytes: 26214400,
          free_uploads_per_utc_month: 10,
          allowed_mime_types: ["application/pdf", "image/png"],
          commercial_offer: {
            upload_count: 10,
            price_cents: 500,
            currency: "USD",
            payments_enabled: false,
          },
        },
      },
      error: null,
    });

    const { edgeGetUploadQuota } = await import("./document-edge-gateway");
    const result = await edgeGetUploadQuota(client as never, "corr-policy");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.quota.remaining).toBe(8);
      expect(result.data.policy.commercial_offer.price_cents).toBe(500);
      expect(result.data.policy.max_file_bytes).toBe(26214400);
    }
  });

  it("falls back to DEPENDENCY_UNAVAILABLE when response body is not structured JSON", async () => {
    const client = clientWithSession();
    invoke.mockResolvedValue({
      data: null,
      error: functionsHttpError(
        new Response("upstream failure", { status: 502 }),
        "FunctionsHttpError: 502",
      ),
    });

    const { edgePrepareDocumentUpload } = await import("./document-edge-gateway");
    const result = await edgePrepareDocumentUpload(client as never, "corr-bad", hiveId, {
      client_request_id: "req-bad",
      filename: "report.pdf",
      mime_type: "application/pdf",
      byte_size: 1024,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.error_code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(result.error.retryable).toBe(true);
      expect(result.error.diagnostic_detail).toBe("FunctionsHttpError: 502");
    }
  });
});
