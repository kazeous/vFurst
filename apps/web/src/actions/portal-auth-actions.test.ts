import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as RateLimitModule from "@/lib/rate-limit";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  redirect: vi.fn(),
  unstable_rethrow: vi.fn(),
  getRequestPortalOrg: vi.fn(),
  authenticatePortalAccount: vi.fn(),
  requestPortalAccountSetup: vi.fn(),
  requestPortalPasswordReset: vi.fn(),
  setPortalAccountPassword: vi.fn(),
  startPortalSession: vi.fn(),
  endPortalSession: vi.fn(),
  assertAuthActionRateLimit: vi.fn(),
  getClientIpFromHeaders: vi.fn()
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, unstable_rethrow: mocks.unstable_rethrow }));
vi.mock("@/lib/portal-request", () => ({ getRequestPortalOrg: mocks.getRequestPortalOrg }));
vi.mock("@/lib/portal-accounts", () => ({
  authenticatePortalAccount: mocks.authenticatePortalAccount,
  requestPortalAccountSetup: mocks.requestPortalAccountSetup,
  requestPortalPasswordReset: mocks.requestPortalPasswordReset,
  setPortalAccountPassword: mocks.setPortalAccountPassword
}));
vi.mock("@/lib/portal-account", () => ({
  startPortalSession: mocks.startPortalSession,
  endPortalSession: mocks.endPortalSession
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...await importOriginal<typeof RateLimitModule>(),
  assertAuthActionRateLimit: mocks.assertAuthActionRateLimit,
  getClientIpFromHeaders: mocks.getClientIpFromHeaders
}));

import { RateLimitExceededError, RateLimitUnavailableError } from "@/lib/rate-limit";
import {
  portalRequestPasswordReset,
  portalSetPassword,
  portalSignIn,
  portalSignOut,
  portalSignUp
} from "./portal-auth-actions";

const org = { id: "org-one", name: "Convention One" };
const account = { id: "account-one", orgId: org.id, authVersion: 2, email: "user@example.com", name: "User" };
const rateLimitMessage = "Too many attempts. Please wait a minute and try again.";
const rateLimitResult = { limited: true, limit: 30, remaining: 0, resetAt: 60_000, degraded: false };

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    email: " User@Example.COM ",
    name: " User ",
    password: "password123",
    confirmPassword: "password123",
    token: "setup-token",
    returnTo: "/account",
    ...overrides
  })) data.set(key, value);
  return data;
}

describe("portal auth actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getRequestPortalOrg.mockResolvedValue(org);
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "192.0.2.1" }));
    mocks.getClientIpFromHeaders.mockReturnValue("192.0.2.1");
    mocks.authenticatePortalAccount.mockResolvedValue(account);
    mocks.setPortalAccountPassword.mockResolvedValue(account);
    mocks.redirect.mockImplementation((path: string) => {
      throw Object.assign(new Error(`Redirect: ${path}`), { digest: "NEXT_REDIRECT" });
    });
    mocks.unstable_rethrow.mockImplementation((error: unknown) => {
      if (error && typeof error === "object" && "digest" in error) throw error;
    });
  });

  it.each([
    ["sign-in", portalSignIn],
    ["sign-up", portalSignUp],
    ["reset", portalRequestPasswordReset],
    ["set-password", portalSetPassword]
  ] as const)("returns the no-tenant error for %s before any account operation", async (_name, action) => {
    mocks.getRequestPortalOrg.mockResolvedValue(null);
    await expect(action({}, form())).resolves.toEqual({
      error: "Open this page from the convention's portal address."
    });
    expect(mocks.assertAuthActionRateLimit).not.toHaveBeenCalled();
    expect(mocks.authenticatePortalAccount).not.toHaveBeenCalled();
    expect(mocks.requestPortalAccountSetup).not.toHaveBeenCalled();
    expect(mocks.requestPortalPasswordReset).not.toHaveBeenCalled();
    expect(mocks.setPortalAccountPassword).not.toHaveBeenCalled();
    expect(mocks.startPortalSession).not.toHaveBeenCalled();
  });

  it.each([[org, "/login"], [null, "/"]] as const)(
    "always signs out and redirects for organization %j",
    async (requestOrg, path) => {
      mocks.getRequestPortalOrg.mockResolvedValue(requestOrg);
      mocks.redirect.mockReturnValue(undefined);
      await expect(portalSignOut(new FormData())).resolves.toBeUndefined();
      expect(mocks.endPortalSession).toHaveBeenCalledExactlyOnceWith();
      expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith(path);
      expect(mocks.endPortalSession.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.getRequestPortalOrg.mock.invocationCallOrder[0]!
      );
    }
  );

  it("returns one incorrect-credentials error without starting a session", async () => {
    mocks.authenticatePortalAccount.mockResolvedValue(null);
    await expect(portalSignIn({}, form())).resolves.toEqual({ error: "Email or password is incorrect." });
    expect(mocks.authenticatePortalAccount).toHaveBeenCalledExactlyOnceWith({
      orgId: org.id, email: "user@example.com", password: "password123"
    });
    expect(mocks.startPortalSession).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(["//evil.test", "/account"])("starts a session and safely redirects sign-in for %s", async (returnTo) => {
    const target = returnTo === "//evil.test" ? "/" : returnTo;
    await expect(portalSignIn({}, form({ returnTo }))).rejects.toThrow(`Redirect: ${target}`);
    expect(mocks.startPortalSession).toHaveBeenCalledExactlyOnceWith(account);
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith(target);
    expect(mocks.startPortalSession.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]!);
    expect(mocks.unstable_rethrow).toHaveBeenCalledOnce();
  });

  it.each([
    ["sign-up", portalSignUp, mocks.requestPortalAccountSetup],
    ["reset", portalRequestPasswordReset, mocks.requestPortalPasswordReset]
  ] as const)("returns the same sent state for %s regardless of account state", async (_name, action, request) => {
    for (const email of ["unknown@example.com", "unclaimed@example.com", "claimed@example.com"]) {
      await expect(action({}, form({ email }))).resolves.toEqual({ sent: true });
      expect(request).toHaveBeenLastCalledWith({ org, email, returnTo: action === portalSignUp ? "/account" : "/" });
    }
  });

  it.each([
    ["portal-login", portalSignIn],
    ["portal-signup", portalSignUp],
    ["portal-reset", portalRequestPasswordReset]
  ] as const)("checks both tenant-scoped rate keys for %s", async (namespace, action) => {
    mocks.authenticatePortalAccount.mockResolvedValue(null);
    await action({}, form());
    expect(mocks.getClientIpFromHeaders).toHaveBeenCalledExactlyOnceWith(await mocks.headers.mock.results[0]!.value);
    expect(mocks.assertAuthActionRateLimit.mock.calls).toEqual([
      [namespace, `${org.id}:192.0.2.1`, rateLimitMessage],
      [namespace, `${org.id}:user@example.com`, rateLimitMessage]
    ]);
  });

  it.each([portalSignIn, portalSignUp, portalRequestPasswordReset])("maps rate limits to inline form state", async (action) => {
    mocks.assertAuthActionRateLimit.mockRejectedValue(new RateLimitExceededError(rateLimitResult, rateLimitMessage));
    await expect(action({}, form())).resolves.toEqual({ error: rateLimitMessage });
    expect(mocks.startPortalSession).not.toHaveBeenCalled();
    expect(mocks.authenticatePortalAccount).not.toHaveBeenCalled();
    expect(mocks.requestPortalAccountSetup).not.toHaveBeenCalled();
    expect(mocks.requestPortalPasswordReset).not.toHaveBeenCalled();
  });

  it.each([portalSignIn, portalSignUp, portalRequestPasswordReset])("does not continue when rate controls are unavailable", async (action) => {
    const error = new RateLimitUnavailableError();
    mocks.assertAuthActionRateLimit.mockRejectedValue(error);
    await expect(action({}, form())).rejects.toBe(error);
    expect(mocks.authenticatePortalAccount).not.toHaveBeenCalled();
    expect(mocks.requestPortalAccountSetup).not.toHaveBeenCalled();
    expect(mocks.requestPortalPasswordReset).not.toHaveBeenCalled();
  });

  it.each([portalSignIn, portalSignUp, portalRequestPasswordReset])("validates email before account calls", async (action) => {
    await expect(action({}, form({ email: "invalid" }))).resolves.toEqual({ error: "A valid email is required" });
    expect(mocks.assertAuthActionRateLimit).not.toHaveBeenCalled();
  });

  it.each([
    [portalSignIn, { password: "short" }, "Password must be at least 8 characters"],
    [portalSetPassword, { password: "short" }, "Password must be at least 8 characters"],
    [portalSetPassword, { name: "   " }, "Name is required"],
    [portalSetPassword, { confirmPassword: "different" }, "Passwords do not match."],
    [portalSetPassword, { confirmPassword: "" }, "Passwords do not match."]
  ] as const)("validates password and name fields inline", async (action, values, error) => {
    await expect(action({}, form(values))).resolves.toEqual({ error });
    expect(mocks.setPortalAccountPassword).not.toHaveBeenCalled();
    expect(mocks.authenticatePortalAccount).not.toHaveBeenCalled();
  });

  it("returns the invalid-link error when password setting returns null", async () => {
    mocks.setPortalAccountPassword.mockResolvedValue(null);
    await expect(portalSetPassword({}, form())).resolves.toEqual({
      error: "This link is invalid, expired, or has already been used."
    });
    expect(mocks.startPortalSession).not.toHaveBeenCalled();
  });

  it("sets the password with host-derived tenant and trimmed name, then signs in safely", async () => {
    await expect(portalSetPassword({}, form({ returnTo: "//evil.test" }))).rejects.toThrow("Redirect: /");
    expect(mocks.setPortalAccountPassword).toHaveBeenCalledExactlyOnceWith({
      orgId: org.id, token: "setup-token", name: "User", password: "password123"
    });
    expect(mocks.startPortalSession).toHaveBeenCalledExactlyOnceWith(account);
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/");
    expect(mocks.unstable_rethrow).toHaveBeenCalledOnce();
  });

  it("rethrows framework control flow before expected-error mapping", async () => {
    const interrupt = Object.assign(new RateLimitExceededError(rateLimitResult, rateLimitMessage), { digest: "NEXT_REDIRECT" });
    mocks.authenticatePortalAccount.mockRejectedValue(interrupt);
    await expect(portalSignIn({}, form())).rejects.toBe(interrupt);
    expect(mocks.unstable_rethrow).toHaveBeenCalledExactlyOnceWith(interrupt);
  });

  it("preserves unexpected errors", async () => {
    const error = new Error("Database offline");
    mocks.setPortalAccountPassword.mockRejectedValue(error);
    await expect(portalSetPassword({}, form())).rejects.toBe(error);
    expect(mocks.unstable_rethrow).toHaveBeenCalledExactlyOnceWith(error);
  });
});
