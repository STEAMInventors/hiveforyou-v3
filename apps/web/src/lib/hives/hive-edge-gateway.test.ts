// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

describe("hive edge gateway", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("maps list responses from the edge function", async () => {
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { access_token: "token-123" } },
          error: null,
        })),
      },
      functions: { invoke },
    };

    invoke.mockResolvedValue({
      data: {
        hives: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Alpha",
            description: null,
            client_request_id: "req-1",
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
            deleting_at: null,
            registered_document_count: 2,
            preview_filenames: ["iep.pdf", "eval.pdf"],
          },
        ],
      },
      error: null,
    });

    const { edgeListHives } = await import("./hive-edge-gateway");
    const result = await edgeListHives(client as never, "corr-1");

    expect(result.ok).toBe(true);
    if (result.ok && result.data.kind === "list") {
      expect(result.data.hives).toHaveLength(1);
      expect(result.data.hives[0]?.name).toBe("Alpha");
      expect(result.data.hives[0]?.deleting_at).toBeNull();
      expect(result.data.hives[0]?.registered_document_count).toBe(2);
      expect(result.data.hives[0]?.preview_filenames).toEqual(["iep.pdf", "eval.pdf"]);
    }
    expect(invoke).toHaveBeenCalledWith(
      "v1-hives",
      expect.objectContaining({
        body: { op: "list" },
        headers: expect.objectContaining({
          Authorization: "Bearer token-123",
          "x-correlation-id": "corr-1",
        }),
      }),
    );
  });

  it("omits card summary fields when absent from edge payload", async () => {
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { access_token: "token-123" } },
          error: null,
        })),
      },
      functions: { invoke },
    };

    invoke.mockResolvedValue({
      data: {
        hives: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Legacy",
            description: null,
            client_request_id: "req-3",
            created_at: "2026-01-03T00:00:00.000Z",
            updated_at: "2026-01-03T00:00:00.000Z",
            deleting_at: null,
          },
        ],
      },
      error: null,
    });

    const { edgeListHives } = await import("./hive-edge-gateway");
    const result = await edgeListHives(client as never, "corr-3");

    expect(result.ok).toBe(true);
    if (result.ok && result.data.kind === "list") {
      expect(result.data.hives[0]?.registered_document_count).toBeUndefined();
      expect(result.data.hives[0]?.preview_filenames).toBeUndefined();
    }
  });

  it("maps deleting_at on list responses", async () => {
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { access_token: "token-123" } },
          error: null,
        })),
      },
      functions: { invoke },
    };

    invoke.mockResolvedValue({
      data: {
        hives: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Stuck",
            description: null,
            client_request_id: "req-2",
            created_at: "2026-01-02T00:00:00.000Z",
            updated_at: "2026-01-02T00:00:00.000Z",
            deleting_at: "2026-01-02T01:00:00.000Z",
          },
        ],
      },
      error: null,
    });

    const { edgeListHives } = await import("./hive-edge-gateway");
    const result = await edgeListHives(client as never, "corr-2");

    expect(result.ok).toBe(true);
    if (result.ok && result.data.kind === "list") {
      expect(result.data.hives[0]?.deleting_at).toBe("2026-01-02T01:00:00.000Z");
    }
  });

  it("maps delete responses from the edge function", async () => {
    const client = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { access_token: "token-123" } },
          error: null,
        })),
      },
      functions: { invoke },
    };

    invoke.mockResolvedValue({
      data: { deleted: true },
      error: null,
    });

    const { edgeDeleteHive } = await import("./hive-edge-gateway");
    const result = await edgeDeleteHive(
      client as never,
      "corr-del",
      "11111111-1111-4111-8111-111111111111",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.kind).toBe("deleted");
    }
    expect(invoke).toHaveBeenCalledWith(
      "v1-hives",
      expect.objectContaining({
        body: {
          op: "delete",
          hive_id: "11111111-1111-4111-8111-111111111111",
        },
      }),
    );
  });
});
