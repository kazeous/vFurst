import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isKnownStaticAssetPath, middleware } from "./src/middleware";

function requestWithHost(host: string, internalHost = "forged.customer.example", pathname = "/") {
  return new NextRequest(`http://localhost:3000${pathname}`, {
    headers: {
      host,
      "x-vfurst-org-host": internalHost,
      "x-vfurst-org-slug": "forged-slug",
      "x-vfurst-domain-mode": "custom-domain"
    }
  });
}

describe("legacy web middleware host safety", () => {
  it.each([
    "",
    "foo_bar.localhost:3000",
    "-leading-hyphen.localhost:3000",
    `${"a".repeat(64)}.localhost:3000`
  ])("returns 400 for malformed Host value %j", (host) => {
    const response = middleware(requestWithHost(host));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
  });

  it("scrubs forged internal headers on the platform pass-through", () => {
    const response = middleware(requestWithHost("vfurst.reyuugames.com"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-vfurst-org-host")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-vfurst-org-host")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-vfurst-org-slug")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-vfurst-domain-mode")).toBeNull();
  });

  it("overwrites forged values for tenant rewrites without echoing them as public response headers", () => {
    const response = middleware(requestWithHost("tenant-a.vfurst.reyuugames.com"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-vfurst-org-host")).toBeNull();
    expect(response.headers.get("x-vfurst-org-slug")).toBeNull();
    expect(response.headers.get("x-vfurst-domain-mode")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-vfurst-org-host")).toBe("tenant-a.vfurst.reyuugames.com");
  });

  it.each(["/schedule.v2", "/people/sam.smith", "/events/2027.08/register"])(
    "rewrites route paths containing a non-asset dot: %s",
    (pathname) => {
      const response = middleware(requestWithHost("tenant-a.vfurst.reyuugames.com", undefined, pathname));
      expect(response.headers.get("x-middleware-rewrite")).toContain(`/tenant-a${pathname}`);
    }
  );

  it.each(["/logo.png", "/assets/app.css", "/exports/attendees.csv"])(
    "passes through known static asset extensions: %s",
    (pathname) => {
      expect(isKnownStaticAssetPath(pathname)).toBe(true);
      const response = middleware(requestWithHost("tenant-a.vfurst.reyuugames.com", undefined, pathname));
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    }
  );
});
