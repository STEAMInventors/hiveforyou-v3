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
});
