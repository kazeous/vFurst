import { describe, expect, it } from "vitest";
import { getConventionPortalRoot } from "./convention";
import { getRootDomain } from "./platform-hosts";

const org = {
  subdomain: "sample-con",
  customDomain: "events.example.com"
};

describe("getConventionPortalRoot", () => {
  it("uses root-relative links on the active custom hostname", () => {
    expect(getConventionPortalRoot("events.example.com", org)).toBe("");
  });

  it("uses root-relative links on the managed tenant subdomain", () => {
    expect(getConventionPortalRoot(`sample-con.${getRootDomain()}`, org)).toBe("");
  });

  it("keeps the tenant path prefix on the platform host", () => {
    expect(getConventionPortalRoot("127.0.0.1:3000", org)).toBe("/sample-con");
  });

  it("does not trust a custom-domain lookalike", () => {
    expect(getConventionPortalRoot("events.example.com.attacker.test", org)).toBe("/sample-con");
  });
});
