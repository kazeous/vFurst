import { describe, expect, it } from "vitest";
import { getPortalHref, getPortalRootFromPathname } from "./portal-path";

describe("portal paths", () => {
  it("keeps the organization prefix on the central platform host", () => {
    expect(getPortalRootFromPathname("/sample-con/register", "sample-con")).toBe("/sample-con");
    expect(getPortalHref("/sample-con/register", "sample-con", "/hotel")).toBe("/sample-con/hotel");
  });

  it("uses host-root paths on a rewritten tenant host", () => {
    expect(getPortalRootFromPathname("/register", "sample-con")).toBe("");
    expect(getPortalHref("/register", "sample-con", "/hotel")).toBe("/hotel");
  });

  it("does not confuse a lookalike central path with the tenant prefix", () => {
    expect(getPortalRootFromPathname("/sample-convention/register", "sample-con")).toBe("");
  });

  it("returns a usable root link for tenant-host pages", () => {
    expect(getPortalHref("/register", "sample-con")).toBe("/");
  });
});
