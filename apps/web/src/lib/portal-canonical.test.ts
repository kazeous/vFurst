import { readdirSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CENTRAL_ROUTE_SEGMENTS, canonicalPortalRedirect, centralPortalCandidate, portalHostKey } from "./portal-canonical";

const org = { subdomain: "acme", customDomain: null, customDomainStatus: null };

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "localhost");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
});
afterEach(() => vi.unstubAllEnvs());

describe("portal canonical host", () => {
  it("every static top-level app route is a central segment", () => {
    const app = new URL("../app/", import.meta.url);
    const routes = readdirSync(app, { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isDirectory()) return [];
      if (entry.name.startsWith("(")) {
        return readdirSync(new URL(`${entry.name}/`, app), { withFileTypes: true })
          .filter((child) => child.isDirectory() && child.name !== "[orgSlug]")
          .map((child) => child.name);
      }
      return entry.name === "[orgSlug]" ? [] : [entry.name];
    });
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) expect(CENTRAL_ROUTE_SEGMENTS.has(route), route).toBe(true);
  });

  it("central portal candidate keeps the suffix and rejects central and internal segments", () => {
    expect(centralPortalCandidate("/acme/register")).toEqual({ key: "acme", portalPath: "/register" });
    expect(centralPortalCandidate("/acme")).toEqual({ key: "acme", portalPath: "/" });
    expect(centralPortalCandidate("/ACME")).toEqual({ key: "acme", portalPath: "/" });
    for (const path of ["/dashboard/x", "/_next/x", "/"]) expect(centralPortalCandidate(path)).toBeNull();
  });

  it("redirects a central-path request to the subdomain host with the query", () => {
    expect(canonicalPortalRedirect({ requestHostname: null, portalPath: "/register", search: "?x=1", org }))
      .toBe("http://acme.localhost:3000/register?x=1");
  });

  it("redirects a subdomain request to an active custom domain", () => {
    expect(canonicalPortalRedirect({ requestHostname: "acme.localhost", portalPath: "/register", search: "",
      org: { ...org, customDomain: "tickets.acme.test", customDomainStatus: "ACTIVE" } }))
      .toBe("http://tickets.acme.test:3000/register");
  });

  it("redirects an inactive custom-domain request back to the subdomain", () => {
    expect(canonicalPortalRedirect({ requestHostname: "tickets.acme.test", portalPath: "/register", search: "",
      org: { ...org, customDomain: "tickets.acme.test", customDomainStatus: "VERIFIED" } }))
      .toBe("http://acme.localhost:3000/register");
  });

  it("leaves a canonical host alone", () => {
    expect(canonicalPortalRedirect({ requestHostname: "acme.localhost", portalPath: "/register", search: "", org })).toBeNull();
  });

  it("a slug host that differs from the subdomain redirects to the subdomain", () => {
    expect(canonicalPortalRedirect({ requestHostname: "acme-slug.localhost", portalPath: "/register", search: "", org }))
      .toBe("http://acme.localhost:3000/register");
  });

  it("uses the managed label or the complete custom hostname as the lookup key", () => {
    expect(portalHostKey("acme.localhost", "localhost")).toBe("acme");
    expect(portalHostKey("tickets.acme.test", "localhost")).toBe("tickets.acme.test");
  });
});
