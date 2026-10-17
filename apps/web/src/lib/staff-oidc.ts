const OIDC_METADATA_CACHE_TTL_MS = 600_000;

export type StaffOidcMetadata = {
  issuer: string;
  jwks_uri: string;
  end_session_endpoint?: string;
};

let cachedMetadata: { value: StaffOidcMetadata; expiresAt: number } | null = null;

function withoutTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function configuredIssuer(): string {
  const issuer = process.env.AUTH_AUTHENTIK_ISSUER;
  if (!issuer) throw new Error("AUTH_AUTHENTIK_ISSUER is not configured.");
  return issuer;
}

export function clearStaffOidcMetadataCache(): void {
  cachedMetadata = null;
}

/** The studio identity provider's discovery document, cached in process. */
export async function getStaffOidcMetadata(now = Date.now()): Promise<StaffOidcMetadata> {
  if (cachedMetadata && cachedMetadata.expiresAt > now) return cachedMetadata.value;

  const issuer = configuredIssuer();
  const response = await fetch(`${withoutTrailingSlash(issuer)}/.well-known/openid-configuration`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok) throw new Error(`OIDC discovery failed with HTTP ${response.status}.`);

  const document = (await response.json()) as Partial<StaffOidcMetadata>;
  if (typeof document.issuer !== "string" || withoutTrailingSlash(document.issuer) !== withoutTrailingSlash(issuer)) {
    throw new Error("OIDC discovery returned a different issuer.");
  }
  if (typeof document.jwks_uri !== "string") throw new Error("OIDC discovery has no jwks_uri.");

  const value: StaffOidcMetadata = {
    issuer: document.issuer,
    jwks_uri: document.jwks_uri,
    ...(typeof document.end_session_endpoint === "string" ? { end_session_endpoint: document.end_session_endpoint } : {})
  };
  cachedMetadata = { value, expiresAt: now + OIDC_METADATA_CACHE_TTL_MS };
  return value;
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
  return new URL("/if/user/", new URL(configuredIssuer()).origin).toString();
}
