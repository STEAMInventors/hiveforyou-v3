import { describe, expect, it } from "vitest";

import {
  authLogLevel,
  classifyAuthError,
  linkErrorCodeForKind,
  publicAuthOutcome,
  sanitizeDiagnostic,
} from "./map-auth-error";
import {
  EMAIL_NOT_CONFIRMED_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  RESET_REQUEST_ACCEPTED,
  SIGN_UP_CHECK_EMAIL_BODY,
  authInfoMessage,
  authLinkErrorMessage,
} from "./messages";

const SECRET = "recovery-token-secret password=hunter2 user@example.com";

function assertNoSecret(value: string) {
  expect(value).not.toContain("recovery-token-secret");
  expect(value).not.toContain("hunter2");
  expect(value).not.toContain("user@example.com");
}

describe("classifyAuthError", () => {
  it("maps invalid email and password policy without echoing the provider message", () => {
    const email = classifyAuthError(
      { code: "email_address_invalid", message: SECRET },
      "sign_up",
    );
    expect(email.kind).toBe("invalid_email");
    expect(email.message).toBe("Enter a valid email address.");
    expect(email.diagnostic).toBe("email_address_invalid");
    assertNoSecret(email.message);
    assertNoSecret(email.diagnostic);

    const weak = classifyAuthError(
      { code: "weak_password", message: `Password is known to be weak. ${SECRET}` },
      "sign_up",
    );
    expect(weak.kind).toBe("weak_password");
    expect(weak.message).toContain("too easy to guess");
    expect(weak.errorCode).toBe("INVALID_REQUEST");
    assertNoSecret(weak.message);

    const policy = classifyAuthError({ code: "validation_failed", message: `password ${SECRET}` }, "sign_up");
    expect(policy.kind).toBe("weak_password");
    expect(policy.message).toContain("10 to 72");
    assertNoSecret(policy.message);
  });

  it("uses one credentials message for a wrong password and an unknown account", () => {
    const wrong = classifyAuthError({ code: "invalid_credentials", message: SECRET }, "sign_in");
    const missing = classifyAuthError({ code: "user_not_found", message: "User not found" }, "sign_in");
    expect(wrong.message).toBe(INVALID_CREDENTIALS_MESSAGE);
    expect(missing.message).toBe(wrong.message);
    expect(missing.kind).toBe("invalid_credentials");
    expect(missing.message.toLowerCase()).not.toContain("not found");
    expect(missing.diagnostic).toBe("user_not_found");
    assertNoSecret(wrong.message);
  });

  it("does not guess that a bare 401 is a bad password", () => {
    const mapped = classifyAuthError({ status: 401, message: SECRET }, "sign_in");
    expect(mapped.kind).toBe("unknown");
    expect(mapped.message).toBe("Something went wrong. Try again.");
    assertNoSecret(mapped.message);
    assertNoSecret(mapped.diagnostic);
  });

  it("maps an exact invalid-credentials message when the code is absent", () => {
    const mapped = classifyAuthError({ message: "Invalid login credentials" }, "sign_in");
    expect(mapped.kind).toBe("invalid_credentials");
    expect(mapped.message).toBe(INVALID_CREDENTIALS_MESSAGE);
  });

  it("shows unconfirmed-email guidance only for that explicit code", () => {
    const mapped = classifyAuthError({ code: "email_not_confirmed", message: SECRET }, "sign_in");
    expect(mapped.kind).toBe("email_not_confirmed");
    expect(mapped.message).toBe(EMAIL_NOT_CONFIRMED_MESSAGE);
    assertNoSecret(mapped.message);
  });

  it("hides whether a signup or reset email already exists", () => {
    const signup = classifyAuthError(
      { code: "user_already_exists", message: "User already registered" },
      "sign_up",
    );
    const reset = classifyAuthError({ code: "user_not_found", message: SECRET }, "recovery_request");
    expect(signup.kind).toBe("conceal_account");
    expect(reset.kind).toBe("conceal_account");
    expect(signup.message).toBe(SIGN_UP_CHECK_EMAIL_BODY);
    expect(reset.message).toBe(RESET_REQUEST_ACCEPTED);
    expect(signup.message.toLowerCase()).not.toContain("already registered");
    expect(signup.message.toLowerCase()).not.toContain("different email");
    expect(publicAuthOutcome("sign_up", signup)).toBe("neutral");
    expect(publicAuthOutcome("recovery_request", reset)).toBe("neutral");
    expect(publicAuthOutcome("recovery_request", classifyAuthError({ code: "over_email_send_rate_limit" }, "recovery_request"))).toBe(
      "error",
    );
    assertNoSecret(signup.message);
    assertNoSecret(reset.message);
  });

  it("distinguishes rate limits, outages, expired links, and reused links", () => {
    const rate = classifyAuthError({ code: "over_request_rate_limit" }, "sign_in");
    expect(rate.kind).toBe("rate_limited");
    expect(rate.retryable).toBe(true);
    expect(rate.message).toContain("Wait a few minutes");
    expect(authLogLevel(rate)).toBe("warn");

    const httpRate = classifyAuthError({ status: 429 }, "resend");
    expect(httpRate.kind).toBe("rate_limited");
    expect(httpRate.diagnostic).toBe("http_429");

    const offline = classifyAuthError({ name: "AuthRetryableFetchError", message: SECRET }, "sign_in");
    expect(offline.kind).toBe("unavailable");
    expect(offline.retryable).toBe(true);
    expect(offline.diagnostic).toBe("fetch_failed");
    expect(offline.errorCode).toBe("DEPENDENCY_UNAVAILABLE");
    assertNoSecret(offline.message);

    const down = classifyAuthError({ status: 503, message: SECRET }, "sign_in");
    expect(down.kind).toBe("unavailable");
    expect(down.diagnostic).toBe("http_503");

    expect(classifyAuthError({ code: "otp_expired" }, "callback").kind).toBe("link_expired");
    expect(classifyAuthError({ code: "flow_state_expired" }, "callback").kind).toBe("link_expired");
    expect(classifyAuthError({ code: "flow_state_not_found" }, "callback").kind).toBe("link_reused");
    expect(classifyAuthError({ code: "bad_code_verifier" }, "callback").kind).toBe("link_reused");
    expect(linkErrorCodeForKind("link_expired")).toBe("link_expired");
    expect(linkErrorCodeForKind("link_reused")).toBe("link_reused");
    expect(linkErrorCodeForKind("unavailable")).toBe("link_unavailable");
    expect(linkErrorCodeForKind("unknown")).toBe("link_invalid");
  });

  it("maps password update conflicts and dropped sessions", () => {
    const same = classifyAuthError({ code: "same_password" }, "password_update");
    expect(same.message).toContain("different");
    const current = classifyAuthError({ code: "invalid_credentials" }, "password_update");
    expect(current.message).toBe("The current password is incorrect.");
    const expired = classifyAuthError({ code: "session_expired", message: SECRET }, "password_update");
    expect(expired.kind).toBe("session_expired");
    expect(expired.message).toContain("session expired");
    assertNoSecret(expired.message);
  });

  it("drops unsafe diagnostics", () => {
    expect(sanitizeDiagnostic("token=super-secret")).toBe("unclassified");
    const mapped = classifyAuthError({ code: "token=super-secret", message: SECRET }, "sign_in");
    expect(mapped.diagnostic).toBe("unclassified");
    expect(mapped.kind).toBe("unknown");
    assertNoSecret(JSON.stringify(mapped));
  });
});

describe("authInfoMessage", () => {
  it("allows only known info codes", () => {
    expect(authInfoMessage("password_updated")).toContain("updated");
    expect(authInfoMessage("javascript:alert(1)")).toBeNull();
  });
});

describe("authLinkErrorMessage", () => {
  it("ignores raw query values", () => {
    expect(authLinkErrorMessage("user@example.com", "login")).toBeNull();
    expect(authLinkErrorMessage("<script>", "recovery")).toBeNull();
    expect(authLinkErrorMessage("link_expired", "recovery")).toContain("expired");
    expect(authLinkErrorMessage("link_reused", "login")).toContain("different browser");
  });
});
