import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { middleware as middlewareFunction } from "./middleware";

const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("./lib/portal-host-directory", () => ({ lookupPortalHostOrganization: mocks.lookup }));

let middleware: typeof middlewareFunction;
const org = { id: "org-acme", subdomain: "acme", customDomain: null, customDomainStatus: null };
function request(path: string, hostname = "localhost", method = "GET") {
  return new NextRequest(`http://${hostname}:3000${path}`, { method, headers: { host: `${hostname}:3000` } });
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
  it("sets tenant headers on a tenant-host API request without rewriting", async () => {
    const response = await middleware(request("/api/portal/session", "acme.localhost"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-vfurst-org-slug")).toBe("acme");
    expect(response.headers.get("x-middleware-request-x-vfurst-org-host")).toBe("acme.localhost");
    expect(response.headers.get("x-middleware-request-x-vfurst-domain-mode")).toBe("subdomain");
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

  it("rewrites a canonical tenant request as before", async () => {
    const response = await middleware(request("/register?x=1", "acme.localhost"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://acme.localhost:3000/acme/register?x=1");
    expect(response.headers.get("x-middleware-request-x-vfurst-org-slug")).toBe("acme");
  });

  it("redirects HEAD but only rewrites tenant POST", async () => {
    expect((await middleware(request("/acme/register", "localhost", "HEAD"))).status).toBe(308);
    mocks.lookup.mockClear();
    const response = await middleware(request("/register", "acme.localhost", "POST"));
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://acme.localhost:3000/acme/register");
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("preserves invalid-host rejection and static/API bypasses", async () => {
    const invalid = new NextRequest("http://localhost:3000/", { headers: { host: "bad/host" } });
    expect((await middleware(invalid)).status).toBe(400);
    for (const path of ["/_next/test", "/logo.svg", "/api/portal/session"]) {
      const response = await middleware(request(path));
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    }
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
});
