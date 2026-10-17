import { afterEach, describe, expect, it, vi } from "vitest";
import { getPortalOrigin, getPortalUrl, type PortalUrlOrganization } from "./portal-url";

const org: PortalUrlOrganization = { subdomain: "acme", customDomain: null, customDomainStatus: null };

afterEach(() => vi.unstubAllEnvs());

describe("portal URLs", () => {
  it("builds a subdomain origin with the app's protocol and port", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "localhost");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

    expect(getPortalOrigin(org)).toBe("http://acme.localhost:3000");
  });

  it("uses https and no port for the deployed root", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "vfurst.reyuugames.com");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://vfurst.reyuugames.com");

    expect(getPortalOrigin(org)).toBe("https://acme.vfurst.reyuugames.com");
  });

  it("prefers an ACTIVE custom domain and ignores a merely VERIFIED one", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "vfurst.reyuugames.com");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://vfurst.reyuugames.com");

    expect(getPortalOrigin({ ...org, customDomain: "tickets.acme.test", customDomainStatus: "ACTIVE" })).toBe(
      "https://tickets.acme.test"
    );
    expect(getPortalOrigin({ ...org, customDomain: "tickets.acme.test", customDomainStatus: "VERIFIED" })).toBe(
      "https://acme.vfurst.reyuugames.com"
    );
  });

  it("keeps paths on the portal host", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "localhost");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

    expect(getPortalUrl(org, "/set-password?token=a&returnTo=%2F")).toBe(
      "http://acme.localhost:3000/set-password?token=a&returnTo=%2F"
    );
    expect(() => getPortalUrl(org, "//evil.test/x")).toThrow();
    expect(() => getPortalUrl(org, "https://evil.test/x")).toThrow();
  });
});
