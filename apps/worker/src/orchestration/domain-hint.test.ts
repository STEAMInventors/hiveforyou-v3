import { domainHintFromClarification } from "@hiveforyou/contracts/study-runs/v1";
import { describe, expect, it } from "vitest";

describe("domainHintFromClarification", () => {
  it("reads a domain hint and ignores other clarification fields", () => {
    expect(
      domainHintFromClarification({
        domain_hint: "iep",
        request_text: "private question",
      }),
    ).toBe("iep");
  });

  it("returns null when no domain was chosen or the hint is not an id", () => {
    expect(domainHintFromClarification(null)).toBeNull();
    expect(domainHintFromClarification({})).toBeNull();
    expect(domainHintFromClarification({ domain_hint: "../iep" })).toBeNull();
  });
});
