import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConventionOrg: vi.fn(),
  getRequestPortalOrg: vi.fn(),
  getPortalAccount: vi.fn(),
  requirePortalAccount: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); })
}));

vi.mock("@/lib/convention", () => ({ getConventionOrg: mocks.getConventionOrg }));
vi.mock("@/lib/portal-request", () => ({ getRequestPortalOrg: mocks.getRequestPortalOrg }));
vi.mock("@/lib/portal-account", () => ({
  getPortalAccount: mocks.getPortalAccount,
  requirePortalAccount: mocks.requirePortalAccount
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));

import {
  assertPortalResourceOrg,
  getPortalActionContext,
  getPortalPageContext,
  isPortalRedirect,
  requirePortalPageContext
} from "./portal-context";

const org = { id: "org-acme", slug: "acme" };
const account = { id: "account-id", orgId: org.id, email: "user@example.com", name: "Attendee" };

describe("portal context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConventionOrg.mockResolvedValue(org);
    mocks.getRequestPortalOrg.mockResolvedValue(org);
    mocks.getPortalAccount.mockResolvedValue(null);
    mocks.requirePortalAccount.mockImplementation(async (_org, returnTo) => {
      mocks.redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    });
  });

  it("page context is not found when the host organization differs from the route organization", async () => {
    mocks.getRequestPortalOrg.mockResolvedValue({ id: "other-org" });
    await expect(getPortalPageContext("acme")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(requirePortalPageContext("acme", "/account")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getPortalAccount).not.toHaveBeenCalled();
    expect(mocks.requirePortalAccount).not.toHaveBeenCalled();
  });

  it("page context is not found when the route or host organization is missing", async () => {
    mocks.getConventionOrg.mockResolvedValueOnce(null);
    await expect(getPortalPageContext("missing")).rejects.toThrow("NEXT_NOT_FOUND");
    mocks.getConventionOrg.mockResolvedValueOnce(null);
    await expect(requirePortalPageContext("missing", "/account")).rejects.toThrow("NEXT_NOT_FOUND");
    mocks.getRequestPortalOrg.mockResolvedValue(null);
    await expect(getPortalPageContext("acme")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(requirePortalPageContext("acme", "/account")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getPortalAccount).not.toHaveBeenCalled();
    expect(mocks.requirePortalAccount).not.toHaveBeenCalled();
  });

  it("page context returns the organization and a null account for a signed-out visitor", async () => {
    await expect(getPortalPageContext("acme")).resolves.toEqual({ org, account: null });
    expect(mocks.getConventionOrg).toHaveBeenCalledWith("acme");
    expect(mocks.getPortalAccount).toHaveBeenCalledWith(org);
  });

  it("requirePortalPageContext redirects a signed-out visitor to the same-host login", async () => {
    await expect(requirePortalPageContext("acme", "/account"))
      .rejects.toThrow("NEXT_REDIRECT:/login?returnTo=%2Faccount");
    expect(mocks.requirePortalAccount).toHaveBeenCalledExactlyOnceWith(org, "/account");
  });

  it("returns signed-in page and action contexts", async () => {
    mocks.getPortalAccount.mockResolvedValue(account);
    mocks.requirePortalAccount.mockResolvedValue(account);
    await expect(getPortalPageContext("acme")).resolves.toEqual({ org, account });
    await expect(requirePortalPageContext("acme", "/account")).resolves.toEqual({ org, account });
    const context = await getPortalActionContext("/register");
    expect(context).toEqual({ org, account });
    expect(isPortalRedirect(context)).toBe(false);
  });

  it("action context returns redirectTo instead of redirecting when signed out", async () => {
    const context = await getPortalActionContext("/register");
    expect(context).toEqual({ redirectTo: "/login?returnTo=%2Fregister" });
    expect(isPortalRedirect(context)).toBe(true);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("action context is not found off a portal host", async () => {
    mocks.getRequestPortalOrg.mockResolvedValue(null);
    await expect(getPortalActionContext("/register")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getPortalAccount).not.toHaveBeenCalled();
  });

  it("assertPortalResourceOrg rejects another organization's resource as not found", () => {
    expect(() => assertPortalResourceOrg("other-org", org)).toThrow("NEXT_NOT_FOUND");
    expect(() => assertPortalResourceOrg(org.id, org)).not.toThrow();
  });
});
