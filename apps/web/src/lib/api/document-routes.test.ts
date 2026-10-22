// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorCode } from "@hiveforyou/contracts/errors/v1";

import { CORRELATION_HEADER } from "@/lib/server/correlation";

const dismissFailedHiveDocumentForUser = vi.fn();
const deleteRegisteredHiveDocumentForUser = vi.fn();
const requireAuthenticatedUser = vi.fn();
const createServerSupabaseClient = vi.fn();

vi.mock("@/lib/documents/service", () => ({
  dismissFailedHiveDocumentForUser,
  deleteRegisteredHiveDocumentForUser,
  abortHiveDocumentUploadForUser: vi.fn(),
  completeHiveDocumentUploadForUser: vi.fn(),
  getUploadQuotaForUser: vi.fn(),
  listHiveDocumentsForUser: vi.fn(),
  prepareHiveDocumentUploadForUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  requireAuthenticatedUser,
  createServerSupabaseClient,
}));

vi.mock("@/lib/server/log", () => ({
  logServerEvent: vi.fn(),
}));

const hiveId = "11111111-1111-4111-8111-111111111111";
const correlationId = "corr-dismiss-test";

function supabaseForUser(userId: string) {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })),
    },
  };
}

describe("handleDismissFailedDocumentUpload", () => {
  beforeEach(() => {
    dismissFailedHiveDocumentForUser.mockReset();
    requireAuthenticatedUser.mockReset();
    createServerSupabaseClient.mockReset();
  });

  it("returns validation error when client_request_id is missing", async () => {
    const { handleDismissFailedDocumentUpload } = await import("./document-routes");
    const response = await handleDismissFailedDocumentUpload(correlationId, hiveId, {});
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error_code).toBe(ErrorCode.INVALID_REQUEST);
    expect(dismissFailedHiveDocumentForUser).not.toHaveBeenCalled();
  });

  it("returns auth error when the user is not signed in", async () => {
    requireAuthenticatedUser.mockResolvedValue({ ok: false });
    const { handleDismissFailedDocumentUpload } = await import("./document-routes");
    const response = await handleDismissFailedDocumentUpload(correlationId, hiveId, {
      client_request_id: "req-dismiss-1",
    });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error_code).toBe(ErrorCode.AUTH_FAILED);
    expect(dismissFailedHiveDocumentForUser).not.toHaveBeenCalled();
  });

  it("returns dismiss payload on success", async () => {
    const userId = "user-abc";
    requireAuthenticatedUser.mockResolvedValue({ ok: true, userId });
    createServerSupabaseClient.mockResolvedValue(supabaseForUser(userId));
    dismissFailedHiveDocumentForUser.mockResolvedValue({
      ok: true,
      body: {
        dismiss: {
          document_id: "doc-failed-1",
          dismissed: true,
        },
      },
    });

    const { handleDismissFailedDocumentUpload } = await import("./document-routes");
    const response = await handleDismissFailedDocumentUpload(correlationId, hiveId, {
      client_request_id: "req-dismiss-1",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get(CORRELATION_HEADER)).toBe(correlationId);
    const body = await response.json();
    expect(body.dismiss.document_id).toBe("doc-failed-1");
    expect(body.dismiss.dismissed).toBe(true);
    expect(dismissFailedHiveDocumentForUser).toHaveBeenCalledWith(
      expect.anything(),
      hiveId,
      correlationId,
      { client_request_id: "req-dismiss-1" },
    );
  });

  it("maps service failures to the error envelope", async () => {
    const userId = "user-abc";
    requireAuthenticatedUser.mockResolvedValue({ ok: true, userId });
    createServerSupabaseClient.mockResolvedValue(supabaseForUser(userId));
    dismissFailedHiveDocumentForUser.mockResolvedValue({
      ok: false,
      error: {
        error_code: "NOT_FOUND",
        message_safe: "Upload not found.",
        retryable: false,
        diagnostic_detail: "edge_function",
      },
    });

    const { handleDismissFailedDocumentUpload } = await import("./document-routes");
    const response = await handleDismissFailedDocumentUpload(correlationId, hiveId, {
      client_request_id: "req-dismiss-1",
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error_code).toBe(ErrorCode.NOT_FOUND);
    expect(body.message_safe).toBe("Upload not found.");
    expect(body.retryable).toBe(false);
  });
});

describe("handleDeleteRegisteredDocumentUpload", () => {
  beforeEach(() => {
    deleteRegisteredHiveDocumentForUser.mockReset();
    requireAuthenticatedUser.mockReset();
    createServerSupabaseClient.mockReset();
  });

  it("returns auth error when the user is not signed in", async () => {
    requireAuthenticatedUser.mockResolvedValue({ ok: false });
    const { handleDeleteRegisteredDocumentUpload } = await import("./document-routes");
    const response = await handleDeleteRegisteredDocumentUpload(correlationId, hiveId, {
      client_request_id: "req-delete-1",
    });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error_code).toBe(ErrorCode.AUTH_FAILED);
    expect(deleteRegisteredHiveDocumentForUser).not.toHaveBeenCalled();
  });

  it("returns delete payload on success", async () => {
    const userId = "user-abc";
    requireAuthenticatedUser.mockResolvedValue({ ok: true, userId });
    createServerSupabaseClient.mockResolvedValue(supabaseForUser(userId));
    deleteRegisteredHiveDocumentForUser.mockResolvedValue({
      ok: true,
      body: {
        delete: {
          document_id: "doc-reg-1",
          deleted: true,
        },
      },
    });

    const { handleDeleteRegisteredDocumentUpload } = await import("./document-routes");
    const response = await handleDeleteRegisteredDocumentUpload(correlationId, hiveId, {
      client_request_id: "req-delete-1",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get(CORRELATION_HEADER)).toBe(correlationId);
    const body = await response.json();
    expect(body.delete.document_id).toBe("doc-reg-1");
    expect(body.delete.deleted).toBe(true);
    expect(deleteRegisteredHiveDocumentForUser).toHaveBeenCalledWith(
      expect.anything(),
      hiveId,
      correlationId,
      { client_request_id: "req-delete-1" },
    );
  });

  it("maps STUDY_SOURCE_LOCKED to validation envelope", async () => {
    const userId = "user-abc";
    requireAuthenticatedUser.mockResolvedValue({ ok: true, userId });
    createServerSupabaseClient.mockResolvedValue(supabaseForUser(userId));
    deleteRegisteredHiveDocumentForUser.mockResolvedValue({
      ok: false,
      error: {
        error_code: "STUDY_SOURCE_LOCKED",
        message_safe: "This document can no longer be changed.",
        retryable: false,
        diagnostic_detail: "edge_function",
      },
    });

    const { handleDeleteRegisteredDocumentUpload } = await import("./document-routes");
    const response = await handleDeleteRegisteredDocumentUpload(correlationId, hiveId, {
      client_request_id: "req-delete-1",
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error_code).toBe(ErrorCode.STUDY_SOURCE_LOCKED);
    expect(body.category).toBe("validation");
    expect(body.message_safe).toBe("This document can no longer be changed.");
    expect(body.retryable).toBe(false);
  });

  it("maps ACCESS_DENIED from the service to authorization envelope", async () => {
    const userId = "user-abc";
    requireAuthenticatedUser.mockResolvedValue({ ok: true, userId });
    createServerSupabaseClient.mockResolvedValue(supabaseForUser(userId));
    deleteRegisteredHiveDocumentForUser.mockResolvedValue({
      ok: false,
      error: {
        error_code: "ACCESS_DENIED",
        message_safe: "You do not have access to this Hive.",
        retryable: false,
        diagnostic_detail: "edge_function",
      },
    });

    const { handleDeleteRegisteredDocumentUpload } = await import("./document-routes");
    const response = await handleDeleteRegisteredDocumentUpload(correlationId, hiveId, {
      client_request_id: "req-delete-1",
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error_code).toBe(ErrorCode.ACCESS_DENIED);
    expect(body.category).toBe("authorization");
    expect(deleteRegisteredHiveDocumentForUser).toHaveBeenCalled();
  });

  it("maps backend failures to the error envelope", async () => {
    const userId = "user-abc";
    requireAuthenticatedUser.mockResolvedValue({ ok: true, userId });
    createServerSupabaseClient.mockResolvedValue(supabaseForUser(userId));
    deleteRegisteredHiveDocumentForUser.mockResolvedValue({
      ok: false,
      error: {
        error_code: "DEPENDENCY_UNAVAILABLE",
        message_safe: "Document service is temporarily unavailable.",
        retryable: true,
        diagnostic_detail: "edge_function",
      },
    });

    const { handleDeleteRegisteredDocumentUpload } = await import("./document-routes");
    const response = await handleDeleteRegisteredDocumentUpload(correlationId, hiveId, {
      client_request_id: "req-delete-1",
    });

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error_code).toBe(ErrorCode.DEPENDENCY_UNAVAILABLE);
    expect(body.retryable).toBe(true);
  });
});
