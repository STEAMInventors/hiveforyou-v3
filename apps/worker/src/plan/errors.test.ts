import { describe, expect, it } from "vitest";

import { pickSafePlanningDiagnostics } from "./errors.js";

describe("pickSafePlanningDiagnostics", () => {
  it("keeps allowlisted keys only", () => {
    expect(
      pickSafePlanningDiagnostics({
        reason: "message_content_invalid_json",
        alias: "worker-p2",
        status: 502,
        duration_ms: 120,
        finish_reason: "length",
        message_content_length: 4096,
        system_prompt: "secret",
        page_text: "private",
      }),
    ).toEqual({
      reason: "message_content_invalid_json",
      alias: "worker-p2",
      status: 502,
      duration_ms: 120,
      finish_reason: "length",
      message_content_length: 4096,
    });
  });
});
