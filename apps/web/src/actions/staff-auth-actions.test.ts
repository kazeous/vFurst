import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as StaffOidc from "@/lib/staff-oidc";

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  auth: vi.fn(),
  signOut: vi.fn(),
  revokeIdentitySession: vi.fn(),
  getStaffOidcMetadata: vi.fn(),
  findUnique: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  })
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth, signOut: mocks.signOut }));
vi.mock("@/lib/identity-session", () => ({ revokeIdentitySession: mocks.revokeIdentitySession }));
vi.mock("@/lib/staff-oidc", async (importOriginal) => ({
  ...(await importOriginal<typeof StaffOidc>()),
  getStaffOidcMetadata: mocks.getStaffOidcMetadata
}));
vi.mock("@vfurst/db", () => ({ prisma: { session: { findUnique: mocks.findUnique } } }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { staffSignOut } from "./staff-auth-actions";

const sessionId = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls.length = 0;
  vi.stubEnv("AUTH_AUTHENTIK_ID", "vfurst-local");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  mocks.auth.mockResolvedValue({ identitySessionId: sessionId, user: { id: "user-1" } });
  mocks.findUnique.mockImplementation(async () => {
    mocks.calls.push("read-id-token");
    return { idToken: "id.token.value" };
  });
  mocks.revokeIdentitySession.mockImplementation(async () => {
    mocks.calls.push("revoke");
  });
  mocks.signOut.mockImplementation(async () => {
    mocks.calls.push("clear-cookie");
  });
  mocks.getStaffOidcMetadata.mockImplementation(async () => {
    mocks.calls.push("discover");
    return { issuer: "http://localhost:8090/vfurst", jwks_uri: "x", end_session_endpoint: "http://localhost:8090/vfurst/endsession" };
  });
});

describe("staffSignOut", () => {
  it("revokes locally, clears the cookie, then redirects to end-session", async () => {
    await expect(staffSignOut()).rejects.toThrow("NEXT_REDIRECT:");

    expect(mocks.calls).toEqual(["read-id-token", "revoke", "clear-cookie", "discover"]);
    expect(mocks.revokeIdentitySession).toHaveBeenCalledWith(sessionId);
    expect(mocks.signOut).toHaveBeenCalledWith({ redirect: false });
    const target = new URL(String(mocks.redirect.mock.calls[0]?.[0]));
    expect(target.origin + target.pathname).toBe("http://localhost:8090/vfurst/endsession");
    expect(Object.fromEntries(target.searchParams)).toEqual({
      id_token_hint: "id.token.value",
      client_id: "vfurst-local",
      post_logout_redirect_uri: "http://localhost:3000/"
    });
  });

  it("still revokes and returns home when discovery fails", async () => {
    mocks.getStaffOidcMetadata.mockRejectedValue(new Error("identity provider unreachable"));

    await expect(staffSignOut()).rejects.toThrow("NEXT_REDIRECT:/");

    expect(mocks.revokeIdentitySession).toHaveBeenCalledWith(sessionId);
    expect(mocks.signOut).toHaveBeenCalledWith({ redirect: false });
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("clears the cookie and returns home without an identity session", async () => {
    mocks.auth.mockResolvedValue(null);
    mocks.getStaffOidcMetadata.mockResolvedValue({ issuer: "i", jwks_uri: "j" });

    await expect(staffSignOut()).rejects.toThrow("NEXT_REDIRECT:/");

    expect(mocks.revokeIdentitySession).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledWith({ redirect: false });
  });
});
