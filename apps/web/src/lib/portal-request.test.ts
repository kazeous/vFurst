import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  getConventionOrg: vi.fn(),
  lookupPortalHostOrganization: vi.fn()
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/convention", () => ({ getConventionOrg: mocks.getConventionOrg }));
vi.mock("@/lib/portal-host-directory", () => ({ lookupPortalHostOrganization: mocks.lookupPortalHostOrganization }));

import { getCachedRequestPortalOrg, getRequestPortalOrg, isSecureRequest } from "./portal-request";

describe("portal request helpers", () => {
  beforeEach(() => vi.resetAllMocks());

  it("treats only an https forwarded protocol as secure", () => {
    expect(isSecureRequest(new Headers({ "x-forwarded-proto": "https" }))).toBe(true);
    expect(isSecureRequest(new Headers({ "x-forwarded-proto": "https, http" }))).toBe(true);
    expect(isSecureRequest(new Headers({ "x-forwarded-proto": " HTTPS , http" }))).toBe(true);
    expect(isSecureRequest(new Headers({ "x-forwarded-proto": "http" }))).toBe(false);
    expect(isSecureRequest(new Headers({ "x-forwarded-proto": "http, https" }))).toBe(false);
    expect(isSecureRequest(new Headers())).toBe(false);
  });

  it("resolves the organization from the request's portal slug", async () => {
    const org = { id: "org-acme", slug: "acme" };
    mocks.headers.mockResolvedValue(new Headers({ "x-vfurst-org-slug": "acme" }));
    mocks.getConventionOrg.mockResolvedValue(org);

    await expect(getRequestPortalOrg()).resolves.toBe(org);
    expect(mocks.getConventionOrg).toHaveBeenCalledExactlyOnceWith("acme");
  });

  it("returns null without looking up an organization on the central host", async () => {
    mocks.headers.mockResolvedValue(new Headers());

    await expect(getRequestPortalOrg()).resolves.toBeNull();
    expect(mocks.getConventionOrg).not.toHaveBeenCalled();
  });

  it("returns null from the cached helper without a portal slug header", async () => {
    mocks.headers.mockResolvedValue(new Headers());
    await expect(getCachedRequestPortalOrg()).resolves.toBeNull();
    expect(mocks.lookupPortalHostOrganization).not.toHaveBeenCalled();
  });

  it("delegates the cached helper to the portal host directory", async () => {
    const org = { id: "org-acme", subdomain: "acme" };
    mocks.headers.mockResolvedValue(new Headers({ "x-vfurst-org-slug": "acme" }));
    mocks.lookupPortalHostOrganization.mockResolvedValue(org);
    await expect(getCachedRequestPortalOrg()).resolves.toBe(org);
    expect(mocks.lookupPortalHostOrganization).toHaveBeenCalledExactlyOnceWith("acme");
    expect(mocks.getConventionOrg).not.toHaveBeenCalled();
  });
});
