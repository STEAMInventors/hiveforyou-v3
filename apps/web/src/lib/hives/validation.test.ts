import { describe, expect, it } from "vitest";

import { parseCreateHiveBody, parseHiveIdParam } from "./validation";

describe("parseCreateHiveBody", () => {
  it("rejects owner_user_id from client", () => {
    const result = parseCreateHiveBody({
      name: "Test",
      client_request_id: "550e8400-e29b-41d4-a716-446655440000",
      owner_user_id: "evil",
    });
    expect(result.ok).toBe(false);
  });

  it("accepts valid payload", () => {
    const result = parseCreateHiveBody({
      name: "  Maya  ",
      description: " notes ",
      client_request_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Maya");
      expect(result.value.description).toBe("notes");
    }
  });

  it("rejects empty name", () => {
    const result = parseCreateHiveBody({
      name: "   ",
      client_request_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.ok).toBe(false);
  });
});

describe("parseHiveIdParam", () => {
  it("validates uuid", () => {
    expect(parseHiveIdParam("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(parseHiveIdParam("not-a-uuid")).toBe(false);
  });
});
