import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffOidcTransaction } from "@vfurst/db";
const mocks = vi.hoisted(() => ({
  $transaction: vi.fn(),
  staffOidcTransaction: { updateMany: vi.fn() }, staffOidcRevocation: { findMany: vi.fn() },
  account: { findUnique: vi.fn() }, user: { findUniqueOrThrow: vi.fn() },
  session: { findUnique: vi.fn(), update: vi.fn() }, syncStaffUser: vi.fn(), issueIdentitySession: vi.fn()
}));
vi.mock("@vfurst/db", () => ({ prisma: mocks, Prisma: {
  TransactionIsolationLevel: { Serializable: "Serializable" }, PrismaClientKnownRequestError: class extends Error {}
} }));
vi.mock("@/lib/staff-identity", () => ({ STAFF_IDENTITY_PROVIDER: "authentik", syncStaffUser: mocks.syncStaffUser }));
vi.mock("@/lib/identity-session", () => ({ IDENTITY_SESSION_MAX_AGE_SECONDS: 43_200, issueIdentitySession: mocks.issueIdentitySession }));
import { completeStaffOidcTransaction } from "./staff-oidc-store";

const now = new Date("2026-10-19T00:00:00Z");
const issuer = "http://localhost:8090/vfurst";
const expires = new Date(now.getTime() + 43_200_000);
function flow(purpose = "login") {
  return { id: "tx-1", tokenHash: "hash", purpose, userId: "user-1", sessionId: "session-1", authVersion: 3, returnTo: "/dashboard",
    expiresAt: new Date(now.getTime() + 600_000), consumedAt: null, createdAt: now } satisfies StaffOidcTransaction;
}
function input(purpose = "login") {
  return { transaction: flow(purpose), userId: "user-1", issuer, clientId: "client", idToken: "id.token", now,
    claims: { sub: "sub-1", email: "staff@example.com", emailVerified: true, groups: [], name: null, image: null, sid: "sid-1" },
    assurance: { primaryAuthenticatedAt: now, mfaEnrolled: true, mfaVerifiedAt: now } };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.$transaction.mockImplementation((operation) => operation(mocks));
  mocks.staffOidcTransaction.updateMany.mockResolvedValue({ count: 1 });
  mocks.staffOidcRevocation.findMany.mockResolvedValue([]);
  mocks.account.findUnique.mockResolvedValue({ userId: "user-1" });
  mocks.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1", authVersion: 3 });
  mocks.issueIdentitySession.mockResolvedValue({ id: "new-session" });
  mocks.session.findUnique.mockResolvedValue({ id: "session-1", userId: "user-1", authVersion: 3,
    expires, idleExpiresAt: new Date(now.getTime() + 1_800_000), revokedAt: null, createdAt: now,
    oidcIssuer: issuer, oidcClientId: "client", oidcSubject: "sub-1", oidcSid: "sid-1" });
});
describe("one-use staff OIDC completion", () => {
  it("issues only after consuming the browser transaction, under serializable isolation", async () => {
    expect((await completeStaffOidcTransaction(input())).identitySessionId).toBe("new-session");
    expect(mocks.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(mocks.syncStaffUser).toHaveBeenCalledWith("user-1", input().claims, now, mocks);
    mocks.staffOidcTransaction.updateMany.mockResolvedValue({ count: 0 });
    await expect(completeStaffOidcTransaction(input())).rejects.toThrow("SessionRevoked");
    expect(mocks.issueIdentitySession).toHaveBeenCalledOnce();
  });
  it.each(["lease", "step-up"])("%s refreshes the original session without sliding its absolute or idle deadline", async (purpose) => {
    expect((await completeStaffOidcTransaction(input(purpose))).identitySessionId).toBe("session-1");
    expect(mocks.issueIdentitySession).not.toHaveBeenCalled();
    const data = mocks.session.update.mock.calls[0][0].data;
    expect(data.expires).toBeUndefined();
    expect(data.idleExpiresAt).toBeUndefined();
    expect(data.idpValidUntil).toEqual(new Date(now.getTime() + 300_000));
  });
  it("rejects changing the actor or sid during a silent check", async () => {
    await expect(completeStaffOidcTransaction({ ...input("lease"), userId: "other" })).rejects.toThrow("ActorChanged");
    await expect(completeStaffOidcTransaction({ ...input("lease"), claims: { ...input().claims, sid: "other" } })).rejects.toThrow("ActorChanged");
    expect(mocks.session.update).not.toHaveBeenCalled();
  });
  it("rejects a refresh if the session was revoked, idle or expired while at the IdP", async () => {
    for (const update of [{ revokedAt: now }, { idleExpiresAt: now }, { expires: now }]) {
      mocks.session.findUnique.mockResolvedValue({ id: "session-1", userId: "user-1", authVersion: 3,
        expires, idleExpiresAt: expires, revokedAt: null, oidcIssuer: issuer, oidcClientId: "client", oidcSubject: "sub-1", ...update });
      await expect(completeStaffOidcTransaction(input("lease"))).rejects.toThrow("SessionRevoked");
    }
    expect(mocks.session.update).not.toHaveBeenCalled();
  });
  it.each(["sid", "sub", "local"])("a %s logout fences an earlier callback even before a session exists", async (kind) => {
    mocks.staffOidcRevocation.findMany.mockResolvedValue([{ kind, revokedThrough: now }]);
    await expect(completeStaffOidcTransaction(input())).rejects.toThrow("SessionRevoked");
    expect(mocks.issueIdentitySession).not.toHaveBeenCalled();
  });
  it("rejects stale primary authentication during step-up even when the ID token is new", async () => {
    const stale = new Date(now.getTime() - 60_000);
    await expect(completeStaffOidcTransaction({ ...input("step-up"), assurance: { primaryAuthenticatedAt: stale, mfaVerifiedAt: stale, mfaEnrolled: true } })).rejects.toThrow("AssuranceRequired");
    expect(mocks.session.update).not.toHaveBeenCalled();
  });
});
