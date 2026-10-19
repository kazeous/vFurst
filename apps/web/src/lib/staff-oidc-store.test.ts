import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffOidcTransaction } from "@vfurst/db";
const mocks = vi.hoisted(() => ({
  $transaction: vi.fn(),
  staffOidcTransaction: { updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  staffOidcRevocation: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
  account: { findUnique: vi.fn() }, user: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  session: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() }, syncStaffUser: vi.fn(), issueIdentitySession: vi.fn()
}));
vi.mock("@vfurst/db", () => ({ prisma: mocks, Prisma: {
  TransactionIsolationLevel: { Serializable: "Serializable" }, PrismaClientKnownRequestError: class extends Error {}
} }));
vi.mock("@/lib/staff-identity", () => ({ STAFF_IDENTITY_PROVIDER: "authentik", syncStaffUser: mocks.syncStaffUser }));
vi.mock("@/lib/identity-session", () => ({ IDENTITY_SESSION_MAX_AGE_SECONDS: 43_200, issueIdentitySession: mocks.issueIdentitySession }));
import { completeStaffOidcTransaction, endStaffBrowserSessions } from "./staff-oidc-store";

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
function stored() {
  return { id: "session-1", userId: "user-1", authVersion: 3,
    expires, idleExpiresAt: new Date(now.getTime() + 1_800_000), revokedAt: null as Date | null, createdAt: now,
    oidcIssuer: issuer, oidcClientId: "client", oidcSubject: "sub-1", oidcSid: "sid-1" };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.$transaction.mockImplementation((operation) => operation(mocks));
  mocks.staffOidcTransaction.updateMany.mockResolvedValue({ count: 1 });
  mocks.staffOidcTransaction.findUnique.mockResolvedValue(null);
  mocks.staffOidcRevocation.findMany.mockResolvedValue([]);
  mocks.staffOidcRevocation.findUnique.mockResolvedValue(null);
  mocks.session.updateMany.mockResolvedValue({ count: 1 });
  mocks.account.findUnique.mockResolvedValue({ userId: "user-1" });
  mocks.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1", authVersion: 3 });
  mocks.issueIdentitySession.mockResolvedValue({ id: "new-session" });
  mocks.session.findUnique.mockResolvedValue(stored());
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
  it("a lease refreshes the original session without sliding its absolute or idle deadline", async () => {
    expect((await completeStaffOidcTransaction(input("lease"))).identitySessionId).toBe("session-1");
    expect(mocks.issueIdentitySession).not.toHaveBeenCalled();
    const data = mocks.session.update.mock.calls[0][0].data;
    expect(data.expires).toBeUndefined();
    expect(data.idleExpiresAt).toBeUndefined();
    expect(data.idpValidUntil).toEqual(new Date(now.getTime() + 300_000));
  });
  it("step-up replaces the old session without sliding its lifetime or restoring a revoked row", async () => {
    expect((await completeStaffOidcTransaction(input("step-up"))).identitySessionId).toBe("new-session");
    expect(mocks.issueIdentitySession).toHaveBeenCalledWith(expect.objectContaining({
      expires, lifetime: { createdAt: now, idleExpiresAt: stored().idleExpiresAt }
    }), mocks);
    expect(mocks.session.updateMany).toHaveBeenCalledWith({ where: { id: "session-1", revokedAt: null },
      data: { revokedAt: now, idToken: null } });
    expect(mocks.session.update).not.toHaveBeenCalled();
    expect(mocks.staffOidcTransaction.update).toHaveBeenCalledWith({ where: { id: "tx-1" },
      data: { userId: "user-1", sessionId: "new-session", authVersion: 3, expiresAt: new Date(now.getTime() + 600_000) } });
  });
  it("accepts fresh MFA on a new sid after authentik retires the previous sid during this intent", async () => {
    const later = new Date(now.getTime() + 2_000);
    mocks.session.findUnique.mockResolvedValue({ ...stored(), revokedAt: later });
    mocks.staffOidcRevocation.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ kind: "sid-sub", revokedThrough: later }]);
    const request = input("step-up");
    expect((await completeStaffOidcTransaction({ ...request, now: later,
      claims: { ...request.claims, sid: "new-idp-session" },
      assurance: { primaryAuthenticatedAt: later, mfaVerifiedAt: later, mfaEnrolled: true }
    })).identitySessionId).toBe("new-session");
    expect(mocks.session.update).not.toHaveBeenCalled();
    expect(mocks.issueIdentitySession).toHaveBeenCalledWith(expect.objectContaining({ oidcSid: "new-idp-session", expires }), mocks);
  });
  it.each(["same-sid", "no-idp-fence", "revoked-before-intent"])("does not replace a revoked session for %s", async (reason) => {
    const later = new Date(now.getTime() + 2_000);
    mocks.session.findUnique.mockResolvedValue({ ...stored(), revokedAt: reason === "revoked-before-intent" ? new Date(now.getTime() - 1) : later });
    const request = input("step-up");
    await expect(completeStaffOidcTransaction({ ...request, now: later,
      claims: { ...request.claims, sid: reason === "same-sid" ? "sid-1" : "new-idp-session" },
      assurance: { primaryAuthenticatedAt: later, mfaVerifiedAt: later, mfaEnrolled: true }
    })).rejects.toThrow("SessionRevoked");
    expect(mocks.issueIdentitySession).not.toHaveBeenCalled();
  });
  it.each(["local", "session", "sub", "sid-sub"])("a %s fence still blocks fresh replacement proof for a different sid", async (kind) => {
    const later = new Date(now.getTime() + 2_000);
    mocks.session.findUnique.mockResolvedValue({ ...stored(), revokedAt: later });
    mocks.staffOidcRevocation.findMany.mockResolvedValueOnce([{ kind, revokedThrough: later }]);
    const request = input("step-up");
    await expect(completeStaffOidcTransaction({ ...request, now: later,
      claims: { ...request.claims, sid: "new-idp-session" },
      assurance: { primaryAuthenticatedAt: later, mfaVerifiedAt: later, mfaEnrolled: true }
    })).rejects.toThrow("SessionRevoked");
    expect(mocks.issueIdentitySession).not.toHaveBeenCalled();
    if (kind === "session") expect(mocks.staffOidcRevocation.findMany.mock.calls[0][0].where.OR)
      .toContainEqual({ kind: "session", valueHash: expect.any(String) });
  });
  it("retains the issued binding for logout arriving just after the original flow deadline", async () => {
    const callbackAt = new Date(now.getTime() + 599_999);
    const request = input("step-up");
    await completeStaffOidcTransaction({ ...request, now: callbackAt,
      assurance: { primaryAuthenticatedAt: callbackAt, mfaVerifiedAt: callbackAt, mfaEnrolled: true } });
    const issued = mocks.staffOidcTransaction.update.mock.calls[0][0].data;
    expect(issued.expiresAt).toEqual(new Date(callbackAt.getTime() + 600_000));
    mocks.staffOidcTransaction.findUnique.mockResolvedValue({ ...request.transaction, ...issued, consumedAt: callbackAt });
    await endStaffBrowserSessions({ actor: null, flowHash: "browser-flow-hash", everywhere: false,
      issuer, clientId: "client", now: new Date(callbackAt.getTime() + 2) });
    expect(mocks.session.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { userId: "user-1", id: { in: ["new-session"] }, revokedAt: null }
    }));
  });
  it("rejects changing the actor or sid during a silent check", async () => {
    await expect(completeStaffOidcTransaction({ ...input("lease"), userId: "other" })).rejects.toThrow("ActorChanged");
    await expect(completeStaffOidcTransaction({ ...input("lease"), claims: { ...input().claims, sid: "other" } })).rejects.toThrow("ActorChanged");
    expect(mocks.session.update).not.toHaveBeenCalled();
  });
  it("rejects a refresh if the session was revoked, idle or expired while at the IdP", async () => {
    for (const update of [{ revokedAt: now }, { idleExpiresAt: now }, { expires: now }]) {
      mocks.session.findUnique.mockResolvedValue({ ...stored(), ...update });
      await expect(completeStaffOidcTransaction(input("lease"))).rejects.toThrow("SessionRevoked");
    }
    expect(mocks.session.update).not.toHaveBeenCalled();
  });
  it.each(["sid", "sub", "local", "session"])("a %s logout fences an earlier callback even before a session exists", async (kind) => {
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

describe("logout racing an IdP session replacement", () => {
  const request = { actor: null, flowHash: "browser-flow-hash", everywhere: false, issuer, clientId: "client", now };
  it("cancels an in-flight browser flow even after the JWT session was revoked by the IdP", async () => {
    mocks.staffOidcTransaction.findUnique.mockResolvedValue(flow("step-up"));
    await endStaffBrowserSessions(request);
    expect(mocks.staffOidcTransaction.updateMany).toHaveBeenCalledWith({ where: { id: "tx-1", consumedAt: null }, data: { consumedAt: now } });
    expect(mocks.staffOidcRevocation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ kind: "local" })
    }));
    expect(mocks.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1", id: { in: ["session-1"] }, revokedAt: null }
    }));
  });
  it("revokes the issued replacement when the callback committed before logout", async () => {
    mocks.staffOidcTransaction.findUnique.mockResolvedValue({ ...flow("step-up"), consumedAt: now, sessionId: "replacement" });
    mocks.session.findUnique.mockResolvedValue({ userId: "user-1", idToken: "replacement.hint" });
    expect(await endStaffBrowserSessions(request)).toBe("replacement.hint");
    expect(mocks.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1", id: { in: ["replacement"] }, revokedAt: null }
    }));
  });
  it("cancels an unbound login without gaining logout authority over any user", async () => {
    mocks.staffOidcTransaction.findUnique.mockResolvedValue({ ...flow(), userId: null, sessionId: null });
    expect(await endStaffBrowserSessions(request)).toBeNull();
    expect(mocks.staffOidcTransaction.updateMany).toHaveBeenCalledOnce();
    expect(mocks.session.updateMany).not.toHaveBeenCalled();
    expect(mocks.user.update).not.toHaveBeenCalled();
  });
  it("logout everywhere also bumps the actor version when only its browser flow remains", async () => {
    mocks.staffOidcTransaction.findUnique.mockResolvedValue(flow("step-up"));
    await endStaffBrowserSessions({ ...request, everywhere: true });
    expect(mocks.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { authVersion: { increment: 1 } } });
    expect(mocks.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1", revokedAt: null } }));
  });
});
