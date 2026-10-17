import { describe, expect, it } from "vitest";
import { portalLoginPath, portalSignupPath } from "./portal-paths";

describe("portal auth paths", () => {
  it("portalLoginPath keeps a local return path and falls back to / for an external one", () => {
    expect(portalLoginPath("/account/orders")).toBe("/login?returnTo=%2Faccount%2Forders");
    expect(portalLoginPath("https://evil.example/")).toBe("/login?returnTo=%2F");
  });

  it("portalSignupPath encodes the return path", () => {
    expect(portalSignupPath("/register")).toBe("/signup?returnTo=%2Fregister");
  });
});
