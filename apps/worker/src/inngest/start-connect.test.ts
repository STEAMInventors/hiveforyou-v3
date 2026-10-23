import { ConnectionState } from "inngest/connect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.fn();

vi.mock("inngest/connect", async (importOriginal) => {
  const actual = await importOriginal<typeof import("inngest/connect")>();
  return {
    ...actual,
    connect: (...args: unknown[]) => connectMock(...args),
  };
});

vi.mock("./client.js", () => ({ workerInngest: { id: "hiveforyou-worker" } }));
vi.mock("./functions/process-study-run.js", () => ({
  processStudyRunInngestFunction: { id: "hive3-process-study-run" },
}));

import {
  getInngestConnectStartupDiagnostic,
  getInngestConnectState,
  resetInngestConnectStateForTests,
  sanitizeConnectStartupError,
  startInngestConnect,
} from "./start-connect.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("Inngest Connect startup diagnostics", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers();
    resetInngestConnectStateForTests();
    connectMock.mockReset();
    process.env = { ...envBackup };
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...envBackup };
    resetInngestConnectStateForTests();
  });

  it("reports DISABLED when Connect is not configured", async () => {
    delete process.env.INNGEST_SIGNING_KEY;
    delete process.env.INNGEST_DEV;

    await startInngestConnect();

    expect(getInngestConnectState()).toBe("DISABLED");
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("reports CONNECTING while connect() is pending", async () => {
    process.env.INNGEST_SIGNING_KEY = "test-signing-key";
    const pending = deferred<{ state: ConnectionState; closed: Promise<void> }>();
    connectMock.mockReturnValue(pending.promise);

    const started = startInngestConnect();
    await Promise.resolve();

    expect(getInngestConnectState()).toBe(ConnectionState.CONNECTING);
    expect(connectMock).toHaveBeenCalledTimes(1);

    pending.resolve({
      state: ConnectionState.ACTIVE,
      closed: new Promise<void>(() => {}),
    });
    await started;
    expect(getInngestConnectState()).toBe(ConnectionState.ACTIVE);
  });

  it("reports FAILED with diagnostic when connect() rejects", async () => {
    process.env.INNGEST_SIGNING_KEY = "test-signing-key";
    const cause = new Error("websocket refused");
    const failure = new Error("Connect handshake failed");
    failure.name = "ConnectError";
    failure.cause = cause;
    connectMock.mockRejectedValue(failure);

    await expect(startInngestConnect()).rejects.toThrow("Connect handshake failed");

    expect(getInngestConnectState()).toBe("FAILED");
    expect(getInngestConnectStartupDiagnostic()).toContain("ConnectError");
    expect(getInngestConnectStartupDiagnostic()).toContain("websocket refused");
  });

  it("times out stalled connect startup without starting a second attempt", async () => {
    process.env.INNGEST_SIGNING_KEY = "test-signing-key";
    process.env.WORKER_INNGEST_CONNECT_STARTUP_TIMEOUT_MS = "5000";
    connectMock.mockImplementation(() => new Promise(() => {}));

    const first = startInngestConnect();
    void startInngestConnect().catch(() => undefined);
    const rejection = expect(first).rejects.toThrow(/timed out after 5000ms/);

    await vi.advanceTimersByTimeAsync(5000);
    await rejection;

    expect(getInngestConnectState()).toBe("FAILED");
    expect(getInngestConnectStartupDiagnostic()).toContain("ConnectStartupTimeoutError");
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it("redacts secret-like substrings from startup error messages", () => {
    const sanitized = sanitizeConnectStartupError(
      new Error("Invalid signing_key=signkey-prod-abc123xyz"),
    );
    expect(sanitized.message_safe).not.toContain("signkey-prod");
    expect(sanitized.message_safe).toContain("[redacted]");
  });
});
