import { describe, expect, it } from "vitest";

import { authEmailRedirectTo, passwordRecoveryEmailRedirectTo } from "./auth-callback-url";

describe("auth callback redirect URLs", () => {
  it("builds recovery redirect with type=recovery only", () => {
    expect(passwordRecoveryEmailRedirectTo("https://hiveforyou-v3.vercel.app")).toBe(
      "https://hiveforyou-v3.vercel.app/auth/callback?type=recovery",
    );
  });

  it("builds signup redirect with safe next path", () => {
    expect(authEmailRedirectTo("http://localhost:3000", "/hives/abc")).toBe(
      "http://localhost:3000/auth/callback?next=%2Fhives%2Fabc",
    );
    expect(authEmailRedirectTo("http://localhost:3000", "https://evil.example")).toBe(
      "http://localhost:3000/auth/callback?next=%2Fhives",
    );
  });
});
