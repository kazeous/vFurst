import { createRemoteJWKSet, customFetch as joseFetch, jwtVerify } from "jose";
import { parseStaffClaims } from "@/lib/staff-identity";
import { parseStaffAssurance, StaffIdentityError } from "@/lib/staff-session-policy";

const OIDC_METADATA_CACHE_TTL_MS = 600_000;

export type StaffOidcMetadata = {
  issuer: string;
  jwks_uri: string;
  end_session_endpoint?: string;
};

let cachedMetadata: { configuredIssuer: string; value: StaffOidcMetadata; expiresAt: number } | null = null;
let remoteKeys: { uri: string; value: ReturnType<typeof createRemoteJWKSet> } | null = null;

function withoutTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function configuredStaffIssuer(): string {
  const issuer = process.env.AUTH_AUTHENTIK_ISSUER;
  if (!issuer) throw new Error("AUTH_AUTHENTIK_ISSUER is not configured.");
  validateStaffEndpoint(issuer);
  return issuer;
}

function validateStaffEndpoint(value: string): URL {
  const url = new URL(value);
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!localHttp && url.protocol !== "https:") || url.username || url.password || url.search || url.hash) {
    throw new Error("Invalid staff OIDC endpoint.");
  }
  return url;
}

/** All IdP traffic stays on the configured origin, with bounded time and body size. */
export const staffOidcFetch: typeof fetch = async (input, init) => {
  const issuer = validateStaffEndpoint(process.env.AUTH_AUTHENTIK_ISSUER ?? "");
  const url = validateStaffEndpoint(input instanceof Request ? input.url : input.toString());
  if (url.origin !== issuer.origin) throw new Error("OIDC endpoint origin mismatch.");
  const response = await fetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(5_000) });
  const reader = response.body?.getReader();
  if (!reader) return response;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > 128 * 1_024) throw new Error("OIDC response too large.");
      chunks.push(part.value);
    }
  } finally { await reader.cancel(); }
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers });
};

export function clearStaffOidcMetadataCache(): void {
  cachedMetadata = null;
  remoteKeys = null;
}

/** The studio identity provider's discovery document, cached in process. */
export async function getStaffOidcMetadata(now = Date.now()): Promise<StaffOidcMetadata> {
  const issuer = configuredStaffIssuer();
  if (cachedMetadata?.configuredIssuer === issuer && cachedMetadata.expiresAt > now) return cachedMetadata.value;
  const response = await staffOidcFetch(`${withoutTrailingSlash(issuer)}/.well-known/openid-configuration`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok) throw new Error(`OIDC discovery failed with HTTP ${response.status}.`);

  const document = (await response.json()) as Partial<StaffOidcMetadata>;
  if (document.issuer !== issuer) {
    throw new Error("OIDC discovery returned a different issuer.");
  }
  if (typeof document.jwks_uri !== "string") throw new Error("OIDC discovery has no jwks_uri.");
  for (const endpoint of [document.jwks_uri, document.end_session_endpoint]) {
    if (endpoint !== undefined && (typeof endpoint !== "string" || validateStaffEndpoint(endpoint).origin !== new URL(issuer).origin)) {
      throw new Error("OIDC discovery endpoint origin mismatch.");
    }
  }

  const value: StaffOidcMetadata = {
    issuer: document.issuer,
    jwks_uri: document.jwks_uri,
    ...(typeof document.end_session_endpoint === "string" ? { end_session_endpoint: document.end_session_endpoint } : {})
  };
  cachedMetadata = { configuredIssuer: issuer, value, expiresAt: now + OIDC_METADATA_CACHE_TTL_MS };
  return value;
}

export async function verifyStaffIdentityToken(idToken: string, now = new Date()) {
  if (!idToken || idToken.length > 16_384) throw new StaffIdentityError("InvalidIdentity");
  const metadata = await getStaffOidcMetadata();
  if (remoteKeys?.uri !== metadata.jwks_uri) remoteKeys = {
    uri: metadata.jwks_uri,
    value: createRemoteJWKSet(new URL(metadata.jwks_uri), { [joseFetch]: staffOidcFetch, timeoutDuration: 5_000 })
  };
  const { payload } = await jwtVerify(idToken, remoteKeys.value, {
    issuer: metadata.issuer, audience: process.env.AUTH_AUTHENTIK_ID ?? "", algorithms: ["RS256"],
    requiredClaims: ["iss", "aud", "sub", "iat", "exp"], maxTokenAge: 300, currentDate: now
  });
  const claims = parseStaffClaims(payload);
  if (!claims) throw new StaffIdentityError("InvalidIdentity");
  return { claims, assurance: parseStaffAssurance(payload, now), issuer: metadata.issuer };
}

export function buildStaffEndSessionUrl(
  endpoint: string,
  input: { idTokenHint: string | null; postLogoutRedirectUri: string }
): string {
  const url = new URL(endpoint);
  if (input.idTokenHint) url.searchParams.set("id_token_hint", input.idTokenHint);
  url.searchParams.set("client_id", process.env.AUTH_AUTHENTIK_ID ?? "");
  url.searchParams.set("post_logout_redirect_uri", input.postLogoutRedirectUri);
  return url.toString();
}

/** Staff profile data lives in authentik's own user interface (spec §6.6). */
export function getStaffAccountManagementUrl(): string {
  return new URL("/if/user/", new URL(configuredStaffIssuer()).origin).toString();
}
