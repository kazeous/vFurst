import { AUTH_COOKIE_NAMES } from "@vfurst/auth";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logoutTenantSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-handoff", () => ({ logoutTenantSession }));
vi.mock("@/lib/environment", () => ({
  getTenantWebEnvironment: () => ({
    managerUrl: "https://manager.vfurst.example"
  })
}));

import { POST } from "./route.js";

describe("tenant logout route", () => {
  beforeEach(() => {
    logoutTenantSession.mockReset();
    logoutTenantSession.mockResolvedValue(
      new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } })
    );
  });

  it("redirects a successful browser form logout to the manager login", async () => {
    const response = await POST(
      new NextRequest("https://console.vfurst.example/auth/logout?return=manager", {
        method: "POST",
        headers: { host: "console.vfurst.example" }
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://manager.vfurst.example/login");
    expect(response.cookies.get(AUTH_COOKIE_NAMES.tenantSession)?.value).toBe("");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("keeps API logout as a non-navigating 204", async () => {
    const response = await POST(
      new NextRequest("https://console.vfurst.example/auth/logout", {
        method: "POST",
        headers: { host: "console.vfurst.example" }
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not turn a rejected host into a manager redirect", async () => {
    logoutTenantSession.mockResolvedValueOnce(NextResponse.json({ error: "misdirected" }, { status: 421 }));

    const response = await POST(
      new NextRequest("https://tenant.vfurst.example/auth/logout?return=manager", {
        method: "POST",
        headers: { host: "tenant.vfurst.example" }
      })
    );

    expect(response.status).toBe(421);
    expect(response.headers.get("location")).toBeNull();
  });
});
