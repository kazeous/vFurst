import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildStaffEndSessionUrl,
  clearStaffOidcMetadataCache,
  getStaffAccountManagementUrl,
  getStaffOidcMetadata
} from "./staff-oidc";

const discovery = {
  issuer: "http://localhost:8090/vfurst",
  jwks_uri: "http://localhost:8090/vfurst/jwks",
  end_session_endpoint: "http://localhost:8090/vfurst/endsession"
};

beforeEach(() => {
  clearStaffOidcMetadataCache();
  vi.stubEnv("AUTH_AUTHENTIK_ISSUER", "http://localhost:8090/vfurst");
  vi.stubEnv("AUTH_AUTHENTIK_ID", "vfurst-local");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("staff OIDC helpers", () => {
  it("builds the end-session URL with the hint, client, and central return", () => {
    const url = new URL(
      buildStaffEndSessionUrl("http://localhost:8090/vfurst/endsession", {
        idTokenHint: "id.token.value",
        postLogoutRedirectUri: "http://localhost:3000/"
      })
    );

    expect(url.origin + url.pathname).toBe("http://localhost:8090/vfurst/endsession");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      id_token_hint: "id.token.value",
      client_id: "vfurst-local",
      post_logout_redirect_uri: "http://localhost:3000/"
    });
  });

  it("omits id_token_hint when none is stored", () => {
    const url = new URL(
      buildStaffEndSessionUrl("http://localhost:8090/vfurst/endsession", {
        idTokenHint: null,
        postLogoutRedirectUri: "http://localhost:3000/"
      })
    );

    expect(url.searchParams.has("id_token_hint")).toBe(false);
    expect(url.searchParams.get("client_id")).toBe("vfurst-local");
  });

  it("caches discovery and rejects a mismatched issuer", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(discovery), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getStaffOidcMetadata()).resolves.toMatchObject(discovery);
    await expect(getStaffOidcMetadata()).resolves.toMatchObject(discovery);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "http://localhost:8090/vfurst/.well-known/openid-configuration",
      expect.objectContaining({ cache: "no-store" })
    );

    clearStaffOidcMetadataCache();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...discovery, issuer: "http://evil.example/x" }))));
    await expect(getStaffOidcMetadata()).rejects.toThrow("issuer");
  });

  it("accepts an issuer that differs only by a trailing slash", async () => {
    vi.stubEnv("AUTH_AUTHENTIK_ISSUER", "https://account.reyuugames.com/application/o/vfurst/");
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ issuer: "https://account.reyuugames.com/application/o/vfurst/", jwks_uri: "https://account.reyuugames.com/application/o/vfurst/jwks/" }))
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getStaffOidcMetadata()).resolves.toMatchObject({ jwks_uri: "https://account.reyuugames.com/application/o/vfurst/jwks/" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://account.reyuugames.com/application/o/vfurst/.well-known/openid-configuration"
    );
  });

  it("rejects even a trailing-slash issuer mismatch and foreign logout or JWKS endpoints", async () => {
    for (const document of [
      { ...discovery, issuer: `${discovery.issuer}/` },
      { ...discovery, jwks_uri: "https://other.example/keys" },
      { ...discovery, end_session_endpoint: "https://other.example/logout" }
    ]) {
      clearStaffOidcMetadataCache();
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(document))));
      await expect(getStaffOidcMetadata()).rejects.toThrow();
    }
  });

  it("links to the authentik user interface on the issuer origin", () => {
    vi.stubEnv("AUTH_AUTHENTIK_ISSUER", "https://account.reyuugames.com/application/o/vfurst/");

    expect(getStaffAccountManagementUrl()).toBe("https://account.reyuugames.com/if/user/");
  });

});
