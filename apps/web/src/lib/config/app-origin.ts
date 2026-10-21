/** Production Vercel deployment — canonical fallback when Host is missing or untrusted. */
export const CANONICAL_APP_ORIGIN = "https://hiveforyou-v3.vercel.app";

export function isTrustedAppHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (host === "hiveforyou-v3.vercel.app") {
    return true;
  }
  if (host === "localhost" || host === "127.0.0.1") {
    return true;
  }
  if (/^hiveforyou-v3-[a-z0-9-]+\.vercel\.app$/.test(host)) {
    return true;
  }
  return false;
}

function protocolForHostname(hostname: string): "http" | "https" {
  return hostname === "localhost" || hostname === "127.0.0.1" ? "http" : "https";
}

/** Resolve origin from a Host header value (first entry only). Returns null if untrusted. */
export function resolveAppOriginFromHost(hostHeader: string | null | undefined): string | null {
  if (!hostHeader?.trim()) {
    return null;
  }
  const host = hostHeader.split(",")[0]?.trim();
  if (!host) {
    return null;
  }
  const hostname = host.includes(":") ? host.slice(0, host.indexOf(":")) : host;
  if (!isTrustedAppHostname(hostname)) {
    return null;
  }
  const protocol = protocolForHostname(hostname);
  return `${protocol}://${host}`;
}

/** Resolve origin from the request URL. Returns null if the hostname is not trusted. */
export function resolveAppOriginFromRequestUrl(requestUrl: string): string | null {
  try {
    const url = new URL(requestUrl);
    if (!isTrustedAppHostname(url.hostname)) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function resolveFromVercelUrl(): string | null {
  const raw = process.env.VERCEL_URL?.trim();
  if (!raw) {
    return null;
  }
  const hostname = raw.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0] ?? "";
  if (!hostname || !isTrustedAppHostname(hostname)) {
    return null;
  }
  return `https://${hostname}`;
}

export type ResolveAppOriginInput = {
  requestUrl?: string;
  hostHeader?: string | null;
};

/**
 * Derives the app origin for auth redirects. Untrusted Host / request origins are ignored;
 * falls back to VERCEL_URL (when trusted) then the canonical production origin.
 */
export function resolveAppOrigin(input: ResolveAppOriginInput = {}): string {
  if (input.requestUrl) {
    const fromRequest = resolveAppOriginFromRequestUrl(input.requestUrl);
    if (fromRequest) {
      return fromRequest;
    }
  }
  const fromHost = resolveAppOriginFromHost(input.hostHeader);
  if (fromHost) {
    return fromHost;
  }
  const fromVercel = resolveFromVercelUrl();
  if (fromVercel) {
    return fromVercel;
  }
  return CANONICAL_APP_ORIGIN;
}

export function isTrustedAppOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return isTrustedAppHostname(url.hostname);
  } catch {
    return false;
  }
}
