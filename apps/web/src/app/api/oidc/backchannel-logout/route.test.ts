import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getStaffOidcMetadata: vi.fn(),
  createRemoteJWKSet: vi.fn(),
  verifyLogoutToken: vi.fn(),
  applyBackchannelLogout: vi.fn(),
  incrementSharedFixedWindow: vi.fn()
}));

vi.mock("@/lib/staff-oidc", () => ({ getStaffOidcMetadata: mocks.getStaffOidcMetadata, staffOidcFetch: vi.fn() }));
vi.mock("jose", () => ({ createRemoteJWKSet: mocks.createRemoteJWKSet, customFetch: Symbol("fetch") }));
vi.mock("@/lib/redis-rate-limit", () => ({ incrementSharedFixedWindow: mocks.incrementSharedFixedWindow }));
vi.mock("@/lib/staff-backchannel-logout", async () => {
  class LogoutTokenError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    LogoutTokenError,
    verifyLogoutToken: mocks.verifyLogoutToken,
    applyBackchannelLogout: mocks.applyBackchannelLogout
  };
});

import { LogoutTokenError } from "@/lib/staff-backchannel-logout";
import { POST } from "./route";

function logoutRequest(token?: string) {
  const body = new URLSearchParams();
  if (token !== undefined) body.set("logout_token", token);
  return new Request("http://localhost:3000/api/oidc/backchannel-logout", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_AUTHENTIK_ISSUER", "http://localhost:8090/vfurst");
  vi.stubEnv("AUTH_AUTHENTIK_ID", "vfurst-local");
  mocks.getStaffOidcMetadata.mockResolvedValue({ issuer: "http://localhost:8090/vfurst", jwks_uri: "http://localhost:8090/vfurst/jwks" });
  mocks.createRemoteJWKSet.mockReturnValue("remote-jwks");
  mocks.verifyLogoutToken.mockResolvedValue({ sub: "sub-1", sid: "sid-1", jti: "jti-1" });
  mocks.applyBackchannelLogout.mockResolvedValue({ revokedSessions: 1, authVersionBumped: false });
  mocks.incrementSharedFixedWindow.mockResolvedValue({ count: 1, resetAt: 0 });
});

describe("POST /api/oidc/backchannel-logout", () => {
  it("returns 400 with no-store for a missing or invalid token", async () => {
    const missing = await POST(logoutRequest());
    expect(missing.status).toBe(400);
    expect(missing.headers.get("cache-control")).toBe("no-store");

    mocks.verifyLogoutToken.mockRejectedValueOnce(new LogoutTokenError("signature"));
    const invalid = await POST(logoutRequest("forged"));
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("cache-control")).toBe("no-store");
    expect(await invalid.json()).toEqual({});
    expect(mocks.applyBackchannelLogout).not.toHaveBeenCalled();
  });

  it("rate limits abusive requests before signature verification", async () => {
    mocks.incrementSharedFixedWindow.mockResolvedValue({ count: 241, resetAt: Date.now() + 60_000 });

    const response = await POST(logoutRequest("replayed"));

    expect(response.status).toBe(429);
    expect(mocks.verifyLogoutToken).not.toHaveBeenCalled();
    expect(mocks.applyBackchannelLogout).not.toHaveBeenCalled();
  });

  it("processes signed logout when Redis is unavailable; DB receipts still protect replay", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.incrementSharedFixedWindow.mockRejectedValue(new Error("redis down"));

    const response = await POST(logoutRequest("valid"));

    expect(response.status).toBe(200);
    expect(mocks.applyBackchannelLogout).toHaveBeenCalledWith({ sub: "sub-1", sid: "sid-1", jti: "jti-1" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns 200 with no-store after revoking", async () => {
    const response = await POST(logoutRequest("valid"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({});
    expect(mocks.verifyLogoutToken).toHaveBeenCalledWith("valid", {
      issuer: "http://localhost:8090/vfurst",
      clientId: "vfurst-local",
      jwks: "remote-jwks"
    });
    expect(mocks.applyBackchannelLogout).toHaveBeenCalledWith({ sub: "sub-1", sid: "sid-1", jti: "jti-1" });
  });
  it("rejects duplicate fields and oversized bodies before cryptographic work", async () => {
    for (const body of ["logout_token=a&logout_token=b", `logout_token=${"a".repeat(25_000)}`]) {
      const response = await POST(new Request("http://localhost:3000/api/oidc/backchannel-logout", {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body
      }));
      expect(response.status).toBe(400);
    }
    expect(mocks.verifyLogoutToken).not.toHaveBeenCalled();
  });
});
