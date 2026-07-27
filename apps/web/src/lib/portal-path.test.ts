import { describe, expect, it } from "vitest";
import { getPortalHref, getPortalRootFromPathname } from "./portal-path";

describe("portal paths", () => {
  it("keeps the organization prefix on the central platform host", () => {
    expect(getPortalRootFromPathname("/sample-convention/register", "sample-convention")).toBe("/sample-convention");
    expect(getPortalHref("/sample-convention/register", "sample-convention", "/hotel")).toBe("/sample-convention/hotel");
  });

  it("uses host-root paths on a rewritten tenant host", () => {
    expect(getPortalRootFromPathname("/register", "sample-con")).toBe("");
    expect(getPortalHref("/register", "sample-con", "/hotel")).toBe("/hotel");
  });

  it("does not confuse a lookalike central path with the tenant prefix", () => {
    expect(getPortalRootFromPathname("/sample-convention-extra/register", "sample-convention")).toBe("");
  });

  it("uses the server-resolved slug instead of a different subdomain", () => {
    expect(getPortalHref("/sample-convention/register", "sample-convention", "/store")).toBe(
      "/sample-convention/store"
    );
  });

  it("returns a usable root link for tenant-host pages", () => {
    expect(getPortalHref("/register", "sample-con")).toBe("/");
  });
});
