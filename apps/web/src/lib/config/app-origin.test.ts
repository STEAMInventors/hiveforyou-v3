import { describe, expect, it } from "vitest";

import {
  CANONICAL_APP_ORIGIN,
  isTrustedAppHostname,
  resolveAppOrigin,
  resolveAppOriginFromHost,
  resolveAppOriginFromRequestUrl,
} from "./app-origin";

describe("app origin trust policy", () => {
  it("allows production and localhost hosts", () => {
    expect(isTrustedAppHostname("hiveforyou-v3.vercel.app")).toBe(true);
    expect(isTrustedAppHostname("localhost")).toBe(true);
    expect(isTrustedAppHostname("127.0.0.1")).toBe(true);
    expect(isTrustedAppHostname("hiveforyou-v3-git-main.vercel.app")).toBe(true);
  });

  it("rejects malicious hostnames", () => {
    expect(isTrustedAppHostname("evil.com")).toBe(false);
    expect(isTrustedAppHostname("hiveforyou-v3.evil.com")).toBe(false);
    expect(resolveAppOriginFromRequestUrl("https://evil.com/auth/callback")).toBe(null);
    expect(resolveAppOriginFromHost("evil.com")).toBe(null);
  });

  it("resolves trusted request URLs without following forged Host headers alone", () => {
    expect(resolveAppOriginFromRequestUrl("http://localhost:3000/auth/callback")).toBe(
      "http://localhost:3000",
    );
    expect(
      resolveAppOrigin({
        requestUrl: "https://hiveforyou-v3.vercel.app/auth/callback",
        hostHeader: "attacker.example",
      }),
    ).toBe("https://hiveforyou-v3.vercel.app");
  });

  it("falls back to canonical origin when everything is untrusted", () => {
    expect(
      resolveAppOrigin({
        requestUrl: "https://phishing.example/auth/callback",
        hostHeader: "phishing.example",
      }),
    ).toBe(CANONICAL_APP_ORIGIN);
  });
});
