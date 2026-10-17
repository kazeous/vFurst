import { hashOpaqueToken } from "@vfurst/auth/core";
import type * as AuthCore from "@vfurst/auth/core";
import { prisma } from "@vfurst/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  portalAccount: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  portalAccountToken: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  portalSession: { updateMany: vi.fn() },
  transaction: vi.fn(),
  $queryRaw: vi.fn(),
  sendOrgEmail: vi.fn(),
  getPortalUrl: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn()
}));

vi.mock("@vfurst/db", () => ({
  prisma: { ...mocks, $transaction: mocks.transaction }
}));
vi.mock("@/lib/email", () => ({ sendOrgEmail: mocks.sendOrgEmail }));
vi.mock("@/lib/portal-url", () => ({ getPortalUrl: mocks.getPortalUrl }));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/portal-request", () => ({ isSecureRequest: vi.fn() }));
vi.mock("@vfurst/auth/core", async (importOriginal) => ({
  ...await importOriginal<typeof AuthCore>(),
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword
}));

import {
  PORTAL_ACCOUNT_TOKEN_TTL_MS,
  authenticatePortalAccount,
  findOrCreatePortalAccount,
  findUsablePortalAccountToken,
  requestPortalAccountSetup,
  requestPortalPasswordReset,
  setPortalAccountPassword
} from "./portal-accounts";
import { assertPortalAccountEmail, syncPortalAccountName } from "./portal-account";

const now = new Date("2026-10-14T00:00:00.000Z");
const org = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Acme Con",
  subdomain: "acme",
  customDomain: null,
  customDomainStatus: "DISABLED" as const,
  contactEmail: "contact@acme.example.com",
  emailProvider: "SMTP" as const,
  emailSettings: null
};
const email = "user@example.com";
const returnTo = "/events?tab=upcoming";
const account = { id: "account-id", orgId: org.id, email, name: "Attendee", authVersion: 2 };
const request = { org, email, returnTo, now };
const passwordInput = { token: "raw-token", orgId: org.id, name: "  New Name  ", password: "password123", now };

function usableToken() {
  return {
    id: "token-id",
    orgId: org.id,
    portalAccountId: account.id,
    tokenHash: hashOpaqueToken(passwordInput.token),
    purpose: "ACCOUNT_SETUP" as const,
    consumedAt: null,
    expiresAt: new Date(now.getTime() + 3_600_000),
    portalAccount: { ...account }
  };
}

function expectTokenEmail(template: "portal-account-setup" | "portal-password-reset", destination = returnTo) {
  const tokenData = mocks.portalAccountToken.create.mock.calls.at(-1)?.[0].data;
  const emailData = mocks.sendOrgEmail.mock.calls.at(-1)?.[3];
  const url = new URL(emailData[template === "portal-account-setup" ? "setupUrl" : "resetUrl"]);
  const rawToken = url.searchParams.get("token")!;
  expect(PORTAL_ACCOUNT_TOKEN_TTL_MS).toBe(3_600_000);
  expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(tokenData).toEqual({
    orgId: org.id,
    portalAccountId: account.id,
    purpose: template === "portal-account-setup" ? "ACCOUNT_SETUP" : "PASSWORD_RESET",
    tokenHash: hashOpaqueToken(rawToken),
    expiresAt: new Date(now.getTime() + 3_600_000)
  });
  expect(JSON.stringify(mocks.portalAccountToken.create.mock.calls)).not.toContain(rawToken);
  expect(url.pathname).toBe("/set-password");
  expect(url.searchParams.get("returnTo")).toBe(destination);
  expect(mocks.getPortalUrl).toHaveBeenCalledWith(
    org, `/set-password?token=${rawToken}&returnTo=${encodeURIComponent(destination)}`
  );
  expect(mocks.sendOrgEmail).toHaveBeenLastCalledWith(org, email, template, {
    organizationName: org.name,
    [template === "portal-account-setup" ? "setupUrl" : "resetUrl"]: url.toString()
  });
}

describe("portal accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.portalAccount.upsert.mockResolvedValue({ ...account, passwordHash: null });
    mocks.portalAccount.findUnique.mockResolvedValue({ ...account, passwordHash: "stored-hash" });
    mocks.portalAccount.update.mockResolvedValue({ ...account, name: "New Name", authVersion: 3 });
    mocks.portalAccountToken.create.mockResolvedValue({});
    mocks.portalAccountToken.findUnique.mockResolvedValue(usableToken());
    mocks.portalAccountToken.updateMany.mockResolvedValue({ count: 1 });
    mocks.portalSession.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (callback) => callback(mocks));
    mocks.$queryRaw.mockResolvedValue([{ id: account.id }]);
    mocks.sendOrgEmail.mockResolvedValue(undefined);
    mocks.getPortalUrl.mockImplementation((_org, path) => `https://acme.example.com${path}`);
    mocks.hashPassword.mockResolvedValue("new-password-hash");
    mocks.verifyPassword.mockResolvedValue(false);
  });

  it("upserts a new account, creates a setup token, and emails its canonical setup URL", async () => {
    await expect(requestPortalAccountSetup(request)).resolves.toBeUndefined();
    expect(mocks.portalAccount.upsert).toHaveBeenCalledWith({
      where: { orgId_email: { orgId: org.id, email } },
      create: { orgId: org.id, email },
      update: {}
    });
    expectTokenEmail("portal-account-setup");
  });

  it("findOrCreatePortalAccount creates an unclaimed account with a normalized email", async () => {
    const unclaimed = { id: account.id, orgId: org.id, email: "walk.in@example.com", name: null };
    mocks.portalAccount.upsert.mockResolvedValue(unclaimed);
    await expect(findOrCreatePortalAccount(prisma, {
      orgId: org.id, email: " Walk.In@Example.COM ", name: null
    })).resolves.toEqual(unclaimed);
    expect(mocks.portalAccount.upsert).toHaveBeenCalledExactlyOnceWith({
      where: { orgId_email: { orgId: org.id, email: "walk.in@example.com" } },
      update: {},
      create: { orgId: org.id, email: "walk.in@example.com", name: null },
      select: { id: true, orgId: true, email: true, name: true }
    });
    expect(mocks.portalAccount.upsert.mock.calls[0][0].create).not.toHaveProperty("passwordHash");
    expect(mocks.portalAccount.update).not.toHaveBeenCalled();
  });

  it("findOrCreatePortalAccount returns an existing claimed account without touching its password", async () => {
    const summary = { id: account.id, orgId: org.id, email, name: account.name };
    mocks.portalAccount.upsert.mockResolvedValue(summary);
    await expect(findOrCreatePortalAccount(prisma, { orgId: org.id, email, name: "Different Name" }))
      .resolves.toEqual(summary);
    expect(mocks.portalAccount.upsert.mock.calls[0][0].update).toEqual({});
    expect(mocks.portalAccount.update).not.toHaveBeenCalled();
  });

  it("findOrCreatePortalAccount trims the name it creates and stores a blank name as null", async () => {
    mocks.portalAccount.upsert.mockResolvedValue({ ...account, name: "Walk In" });
    await findOrCreatePortalAccount(prisma, { orgId: org.id, email, name: "  Walk In  " });
    expect(mocks.portalAccount.upsert.mock.calls[0]?.[0].create).toEqual({ orgId: org.id, email: "user@example.com", name: "Walk In" });
    mocks.portalAccount.upsert.mockClear();
    mocks.portalAccount.upsert.mockResolvedValue({ ...account, name: null });
    await findOrCreatePortalAccount(prisma, { orgId: org.id, email, name: "   " });
    expect(mocks.portalAccount.upsert.mock.calls[0]?.[0].create.name).toBeNull();
  });

  it("findOrCreatePortalAccount fills a missing name but never overwrites one", async () => {
    mocks.portalAccount.upsert.mockResolvedValue({ ...account, name: null });
    mocks.portalAccount.update.mockResolvedValue({ ...account, name: "Walk In" });
    await expect(findOrCreatePortalAccount(prisma, { orgId: org.id, email, name: "  Walk In  " }))
      .resolves.toMatchObject({ name: "Walk In" });
    expect(mocks.portalAccount.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: account.id }, data: { name: "Walk In" },
      select: { id: true, orgId: true, email: true, name: true }
    });

    mocks.portalAccount.update.mockClear();
    mocks.portalAccount.upsert.mockResolvedValue(account);
    await findOrCreatePortalAccount(prisma, { orgId: org.id, email, name: "New Name" });
    expect(mocks.portalAccount.update).not.toHaveBeenCalled();

    mocks.portalAccount.upsert.mockResolvedValue({ ...account, name: null });
    await findOrCreatePortalAccount(prisma, { orgId: org.id, email, name: "   " });
    expect(mocks.portalAccount.update).not.toHaveBeenCalled();
  });

  it("assertPortalAccountEmail compares normalized identity emails", () => {
    expect(() => assertPortalAccountEmail(account, "  User@Example.COM ")).not.toThrow();
    expect(() => assertPortalAccountEmail(account, "other@example.com"))
      .toThrow("Use the email address from your signed-in vFurst account.");
  });

  it("syncPortalAccountName updates a changed non-empty name and returns only the account summary", async () => {
    const summary = { id: account.id, orgId: org.id, email, name: "New Name" };
    mocks.portalAccount.update.mockResolvedValue(summary);
    await expect(syncPortalAccountName(account, "  New Name  ")).resolves.toEqual(summary);
    expect(mocks.portalAccount.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: account.id }, data: { name: "New Name" },
      select: { id: true, orgId: true, email: true, name: true }
    });

    mocks.portalAccount.update.mockClear();
    await expect(syncPortalAccountName(account, "  Attendee  ")).resolves.toBe(account);
    await expect(syncPortalAccountName(account, "   ")).resolves.toBe(account);
    expect(mocks.portalAccount.update).not.toHaveBeenCalled();
  });

  it("sends setup for an existing unclaimed account", async () => {
    await requestPortalAccountSetup(request);
    expectTokenEmail("portal-account-setup");
    expect(mocks.portalAccount.update).not.toHaveBeenCalled();
  });

  it("sends account-exists links for a claimed account without creating or consuming tokens", async () => {
    mocks.portalAccount.upsert.mockResolvedValue({ ...account, passwordHash: "stored-hash" });
    await requestPortalAccountSetup(request);
    expect(mocks.sendOrgEmail).toHaveBeenCalledExactlyOnceWith(org, email, "portal-account-exists", {
      organizationName: org.name,
      signInUrl: `https://acme.example.com/login?returnTo=${encodeURIComponent(returnTo)}`,
      resetUrl: "https://acme.example.com/forgot-password"
    });
    expect(mocks.getPortalUrl).toHaveBeenCalledWith(org, `/login?returnTo=${encodeURIComponent(returnTo)}`);
    expect(mocks.getPortalUrl).toHaveBeenCalledWith(org, "/forgot-password");
    expect(mocks.portalAccountToken.create).not.toHaveBeenCalled();
    expect(mocks.portalAccountToken.updateMany).not.toHaveBeenCalled();
    expect(mocks.portalAccount.update).not.toHaveBeenCalled();
  });

  it("normalizes mixed case and whitespace before signup and delivery", async () => {
    await requestPortalAccountSetup({ ...request, email: "  User@Example.COM " });
    expect(mocks.portalAccount.upsert).toHaveBeenCalledWith({
      where: { orgId_email: { orgId: org.id, email } }, create: { orgId: org.id, email }, update: {}
    });
    expect(mocks.sendOrgEmail.mock.calls[0][1]).toBe(email);
  });

  it("does nothing for a reset requested with an unknown email", async () => {
    mocks.portalAccount.findUnique.mockResolvedValue(null);
    await expect(requestPortalPasswordReset(request)).resolves.toBeUndefined();
    expect(mocks.sendOrgEmail).not.toHaveBeenCalled();
    expect(mocks.portalAccountToken.create).not.toHaveBeenCalled();
    expect(mocks.portalAccountToken.updateMany).not.toHaveBeenCalled();
    expect(mocks.portalAccount.upsert).not.toHaveBeenCalled();
  });

  it("sends setup for an unclaimed reset and password-reset for a claimed reset", async () => {
    mocks.portalAccount.findUnique.mockResolvedValueOnce({ ...account, passwordHash: null });
    await requestPortalPasswordReset(request);
    expectTokenEmail("portal-account-setup");
    await requestPortalPasswordReset({ ...request, email: "  User@Example.COM " });
    expectTokenEmail("portal-password-reset");
    expect(mocks.portalAccount.findUnique).toHaveBeenLastCalledWith({
      where: { orgId_email: { orgId: org.id, email } }
    });
  });

  it("consumes prior unconsumed tokens of the same purpose before creating a replacement", async () => {
    await requestPortalAccountSetup(request);
    expect(mocks.portalAccountToken.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { portalAccountId: account.id, purpose: "ACCOUNT_SETUP", consumedAt: null },
      data: { consumedAt: now }
    });
    expect(mocks.portalAccountToken.updateMany.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.portalAccountToken.create.mock.invocationCallOrder[0]);
  });

  it("leaves only one usable link after concurrent requests for the same account and purpose", async () => {
    // Stateful database double: statement execution yields; FOR UPDATE holds the
    // account lock until the transaction exits. Assertions inspect stored rows
    // and resolve delivered links through the public API, not mock call counts.
    for (const claimed of [false, true]) {
      const rows: Array<ReturnType<typeof usableToken>> = [];
      let lockTail = Promise.resolve();
      mocks.portalAccount.findUnique.mockResolvedValue({ ...account, passwordHash: claimed ? "hash" : null });
      mocks.portalAccountToken.updateMany.mockImplementation(async ({ where, data }) => {
        let count = 0;
        for (const row of rows) {
          if (row.portalAccountId === where.portalAccountId && row.purpose === where.purpose && row.consumedAt === null) {
            Object.assign(row, data);
            count += 1;
          }
        }
        await Promise.resolve();
        return { count };
      });
      mocks.portalAccountToken.create.mockImplementation(async ({ data }) => {
        const row = { ...usableToken(), ...data, id: `token-${rows.length}` };
        rows.push(row);
        return row;
      });
      mocks.portalAccountToken.findUnique.mockImplementation(async ({ where }) =>
        rows.find((row) => row.tokenHash === where.tokenHash) ?? null
      );
      mocks.transaction.mockImplementation(async (callback) => {
        let release: (() => void) | undefined;
        try {
          return await callback({
            ...mocks,
            $queryRaw: async (query: TemplateStringsArray) => {
              if (!query.join("").includes("FOR UPDATE")) throw new Error("Unsupported database query");
              const prior = lockTail;
              lockTail = new Promise<void>((resolve) => { release = resolve; });
              await prior;
              return [{ id: account.id }];
            }
          });
        } finally {
          release?.();
        }
      });
      mocks.sendOrgEmail.mockClear();
      const issue = claimed ? requestPortalPasswordReset : requestPortalAccountSetup;
      await Promise.all([issue(request), issue(request)]);
      const links = mocks.sendOrgEmail.mock.calls.map((call) => new URL(call[3].setupUrl ?? call[3].resetUrl));
      const usable = await Promise.all(links.map((link) => findUsablePortalAccountToken({
        token: link.searchParams.get("token")!, orgId: org.id, now
      })));
      expect(rows).toHaveLength(2);
      expect(rows.filter((row) => row.consumedAt === null)).toHaveLength(1);
      expect(usable.filter(Boolean)).toHaveLength(1);
    }
  });

  it("keeps setup responses identical if email delivery rejects and logs no recipient or token", async () => {
    const error = new Error("secret token and recipient in provider error");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.sendOrgEmail.mockRejectedValue(error);
      await expect(requestPortalAccountSetup(request)).resolves.toBeUndefined();
      expect(log).toHaveBeenCalledExactlyOnceWith({ orgId: org.id, template: "portal-account-setup" });
    } finally {
      log.mockRestore();
    }
  });

  it("rejects missing, expired, consumed, and foreign-organization tokens", async () => {
    for (const row of [null, { ...usableToken(), expiresAt: now },
      { ...usableToken(), expiresAt: new Date(now.getTime() - 1) },
      { ...usableToken(), consumedAt: now }, { ...usableToken(), orgId: "other-org" }]) {
      mocks.portalAccountToken.findUnique.mockResolvedValue(row);
      await expect(findUsablePortalAccountToken({ token: passwordInput.token, orgId: org.id, now })).resolves.toBeNull();
    }
  });

  it("guards token consumption, then verifies the email, increments the version, and revokes sessions", async () => {
    mocks.portalAccountToken.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(setPortalAccountPassword(passwordInput)).resolves.toBeNull();
    expect(mocks.portalAccount.update).not.toHaveBeenCalled();
    expect(mocks.portalAccountToken.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: "token-id", consumedAt: null }, data: { consumedAt: now }
    });
    expect(mocks.portalSession.updateMany).not.toHaveBeenCalled();

    vi.clearAllMocks();
    await expect(setPortalAccountPassword(passwordInput)).resolves.toEqual({ ...account, name: "New Name", authVersion: 3 });
    expect(mocks.hashPassword).toHaveBeenCalledWith(passwordInput.password);
    expect(mocks.hashPassword.mock.invocationCallOrder[0]).toBeLessThan(mocks.transaction.mock.invocationCallOrder[0]);
    expect(mocks.portalAccount.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: account.id },
      data: { passwordHash: "new-password-hash", emailVerifiedAt: now, name: "New Name", authVersion: { increment: 1 } },
      select: { id: true, orgId: true, email: true, name: true, authVersion: true }
    });
    expect(mocks.portalAccountToken.updateMany).toHaveBeenNthCalledWith(2, {
      where: { portalAccountId: account.id, consumedAt: null }, data: { consumedAt: now }
    });
    expect(mocks.portalSession.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { portalAccountId: account.id, revokedAt: null }, data: { revokedAt: now }
    });
    const ordered = [mocks.portalAccountToken.findUnique.mock.invocationCallOrder[0], mocks.$queryRaw.mock.invocationCallOrder[0],
      mocks.portalAccountToken.updateMany.mock.invocationCallOrder[0], mocks.portalAccount.update.mock.invocationCallOrder[0],
      mocks.portalAccountToken.updateMany.mock.invocationCallOrder[1], mocks.portalSession.updateMany.mock.invocationCallOrder[0]];
    expect(ordered).toEqual([...ordered].sort((a, b) => a - b));
  });

  it("verifies exactly once for wrong passwords, unknown email, and unclaimed accounts", async () => {
    for (const row of [{ ...account, passwordHash: "stored-hash" }, null, { ...account, passwordHash: null }]) {
      mocks.portalAccount.findUnique.mockResolvedValue(row);
      mocks.verifyPassword.mockClear();
      await expect(authenticatePortalAccount({ orgId: org.id, email: "  User@Example.COM ", password: "wrong" })).resolves.toBeNull();
      expect(mocks.verifyPassword).toHaveBeenCalledExactlyOnceWith("wrong", row?.passwordHash ?? "new-password-hash");
      expect(mocks.portalAccount.findUnique).toHaveBeenLastCalledWith({ where: { orgId_email: { orgId: org.id, email } } });
    }
    expect(mocks.hashPassword).toHaveBeenCalledExactlyOnceWith("vfurst-portal-timing-equalizer");
  });

  it("returns only the purpose and account fields needed for the set-password form", async () => {
    for (const purpose of ["ACCOUNT_SETUP", "PASSWORD_RESET"] as const) {
      mocks.portalAccountToken.findUnique.mockResolvedValue({ ...usableToken(), purpose });
      await expect(findUsablePortalAccountToken({ token: passwordInput.token, orgId: org.id, now })).resolves.toEqual({
        purpose, account: { id: account.id, email, name: account.name }
      });
    }
    expect(mocks.portalAccountToken.findUnique.mock.calls[0][0].where).toEqual({ tokenHash: hashOpaqueToken(passwordInput.token) });
  });

  it("rejects unusable tokens before hashing the password or opening a transaction", async () => {
    for (const row of [null, { ...usableToken(), expiresAt: now }, { ...usableToken(), consumedAt: now },
      { ...usableToken(), orgId: "other-org" }]) {
      mocks.portalAccountToken.findUnique.mockResolvedValue(row);
      await expect(setPortalAccountPassword(passwordInput)).resolves.toBeNull();
    }
    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rechecks the token inside the password transaction without writing account state", async () => {
    for (const row of [null, { ...usableToken(), expiresAt: now }, { ...usableToken(), consumedAt: now },
      { ...usableToken(), orgId: "other-org" }]) {
      mocks.portalAccountToken.findUnique.mockResolvedValueOnce(usableToken()).mockResolvedValueOnce(row);
      await expect(setPortalAccountPassword(passwordInput)).resolves.toBeNull();
    }
    expect(mocks.portalAccountToken.updateMany).not.toHaveBeenCalled();
    expect(mocks.portalAccount.update).not.toHaveBeenCalled();
    expect(mocks.portalSession.updateMany).not.toHaveBeenCalled();
  });

  it("keeps account-exists sign-in links on local return paths", async () => {
    mocks.portalAccount.upsert.mockResolvedValue({ ...account, passwordHash: "stored-hash" });
    await requestPortalAccountSetup({ ...request, returnTo: "//evil.test" });
    expect(mocks.getPortalUrl).toHaveBeenCalledWith(org, "/login?returnTo=%2F");
  });

  it("sanitizes external return paths in account token links", async () => {
    await requestPortalAccountSetup({ ...request, returnTo: "https://evil.example" });
    expectTokenEmail("portal-account-setup", "/");
  });

  it("returns an authenticated account summary and version without exposing its password", async () => {
    mocks.verifyPassword.mockResolvedValue(true);
    await expect(authenticatePortalAccount({ orgId: org.id, email, password: "correct" })).resolves.toEqual(account);
    expect(mocks.verifyPassword).toHaveBeenCalledExactlyOnceWith("correct", "stored-hash");
  });
});
