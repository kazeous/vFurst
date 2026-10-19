import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { middleware as middlewareFunction } from "./middleware";

const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("./lib/portal-host-directory", () => ({ lookupPortalHostOrganization: mocks.lookup }));

let middleware: typeof middlewareFunction;
const org = { id: "org-acme", subdomain: "acme", customDomain: null, customDomainStatus: null };
function request(path: string, hostname = "localhost", method = "GET", headers: Record<string, string> = {}) {
  return new NextRequest(`http://${hostname}:3000${path}`, { method, headers: { ...headers, host: `${hostname}:3000` } });
}

beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "localhost");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.clearAllMocks();
  vi.resetModules();
  mocks.lookup.mockResolvedValue(org);
  ({ middleware } = await import("./middleware"));
});
afterEach(() => vi.unstubAllEnvs());

describe("canonical host middleware", () => {
  it("canonicalizes staff routes on platform aliases before setting host-only auth cookies", async () => {
    const response = await middleware(request("/login?returnTo=/dashboard", "console.vfurst.reyuugames.com"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?returnTo=/dashboard");
    const post = await middleware(request("/api/auth/signin/authentik", "console.vfurst.reyuugames.com", "POST"));
    expect(post.status).toBe(421);
    expect(post.headers.get("set-cookie")).toBeNull();
  });
  it("sets tenant headers on a tenant-host API request without rewriting", async () => {
    const response = await middleware(request("/api/portal/session", "acme.localhost"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-vfurst-org-slug")).toBe("acme");
    expect(response.headers.get("x-middleware-request-x-vfurst-org-host")).toBe("acme.localhost");
    expect(response.headers.get("x-middleware-request-x-vfurst-domain-mode")).toBe("subdomain");
    expect(response.headers.get("x-middleware-request-x-vfurst-portal-slug")).toBeNull();
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("redirects a central-path portal GET with 308 and keeps the query", async () => {
    const response = await middleware(request("/acme/register?x=1"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("http://acme.localhost:3000/register?x=1");
    expect(mocks.lookup).toHaveBeenCalledExactlyOnceWith("acme");
  });

  it("does not redirect a central-path POST", async () => {
    const response = await middleware(request("/acme/register", "localhost", "POST"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("does not look up central routes", async () => {
    await middleware(request("/dashboard"));
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("redirects a tenant GET to the active custom domain", async () => {
    mocks.lookup.mockResolvedValue({ ...org, customDomain: "tickets.acme.test", customDomainStatus: "ACTIVE" });
    const response = await middleware(request("/register", "acme.localhost"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("http://tickets.acme.test:3000/register");
  });

  it("hands a canonical tenant request to the config portal rewrite", async () => {
    // next.config.ts rewrites on this header. A middleware rewrite would make Next
    // match the prerender manifest against "/register" and skip the ISR cache.
    const response = await middleware(request("/register?x=1", "acme.localhost"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-request-x-vfurst-portal-slug")).toBe("acme");
    expect(response.headers.get("x-middleware-request-x-vfurst-org-slug")).toBe("acme");
  });

  it("names the custom domain as the portal key on a custom-domain host", async () => {
    mocks.lookup.mockResolvedValue({ ...org, customDomain: "tickets.acme.test", customDomainStatus: "ACTIVE" });
    const response = await middleware(request("/", "tickets.acme.test"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-vfurst-portal-slug")).toBe("tickets.acme.test");
    expect(response.headers.get("x-middleware-request-x-vfurst-domain-mode")).toBe("custom-domain");
  });

  it("redirects HEAD but only hands tenant POST to the portal rewrite", async () => {
    expect((await middleware(request("/acme/register", "localhost", "HEAD"))).status).toBe(308);
    mocks.lookup.mockClear();
    const response = await middleware(request("/register", "acme.localhost", "POST"));
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-vfurst-portal-slug")).toBe("acme");
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("classifies Next's internal request from its bind address by the forwarded host", async () => {
    // Next renders a server action's redirect by fetching it from http://<bind address>:<port>
    // and forwards the original host only as x-forwarded-host.
    vi.stubEnv("NODE_ENV", "production");
    for (const bindHost of ["0.0.0.0", "127.0.0.1"]) {
      const central = await middleware(
        request("/platform/organizations/org-1", bindHost, "GET", { "x-forwarded-host": "localhost:3000" })
      );
      expect(central.headers.get("location")).toBeNull();
      expect(central.headers.get("x-middleware-next")).toBe("1");
      expect(central.headers.get("x-middleware-request-x-vfurst-portal-slug")).toBeNull();
      expect(central.headers.get("x-middleware-request-x-vfurst-org-slug")).toBeNull();

      const portal = await middleware(request("/register", bindHost, "GET", { "x-forwarded-host": "acme.localhost:3000" }));
      expect(portal.headers.get("location")).toBeNull();
      expect(portal.headers.get("x-middleware-request-x-vfurst-portal-slug")).toBe("acme");
    }
  });

  it("ignores x-forwarded-host when the Host is a real hostname", async () => {
    const response = await middleware(request("/register", "acme.localhost", "GET", { "x-forwarded-host": "localhost:3000" }));
    expect(response.headers.get("x-middleware-request-x-vfurst-portal-slug")).toBe("acme");
  });

  it("drops a client-supplied portal slug header on central routes", async () => {
    const response = await middleware(request("/dashboard", "localhost", "GET", { "x-vfurst-portal-slug": "evil" }));
    expect(response.headers.get("x-middleware-request-x-vfurst-portal-slug")).toBeNull();
    expect(response.headers.get("x-middleware-override-headers")?.split(",")).not.toContain("x-vfurst-portal-slug");
  });

  it("preserves invalid-host rejection and static/API bypasses", async () => {
    const invalid = new NextRequest("http://localhost:3000/", { headers: { host: "bad/host" } });
    expect((await middleware(invalid)).status).toBe(400);
    for (const path of ["/_next/test", "/logo.svg", "/api/portal/session"]) {
      const response = await middleware(request(path, "acme.localhost"));
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(response.headers.get("x-middleware-request-x-vfurst-portal-slug")).toBeNull();
    }
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
});
