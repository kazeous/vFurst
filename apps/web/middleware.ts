import { InvalidTenantHostError } from "@vfurst/tenant-context";
import { NextResponse, type NextRequest } from "next/server";
import { getRootDomain, isPlatformHostname, normalizeHostname } from "./src/lib/platform-hosts";
import { scrubVfurstInternalHeaders } from "./src/lib/request-headers";

const ROOT_DOMAIN = getRootDomain();

function getHostname(request: NextRequest) {
  return normalizeHostname(request.headers.get("host") ?? "");
}

export function middleware(request: NextRequest) {
  let hostname: string;

  try {
    hostname = getHostname(request);
  } catch (error) {
    if (error instanceof InvalidTenantHostError) {
      return NextResponse.json(
        { error: { code: "invalid_host", message: "The request Host header is invalid." } },
        { status: 400, headers: { "cache-control": "no-store, max-age=0" } }
      );
    }

    throw error;
  }

  const pathname = request.nextUrl.pathname;
  const requestHeaders = scrubVfurstInternalHeaders(request.headers);

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") ||
    isPlatformHostname(hostname)
  ) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const rewriteUrl = request.nextUrl.clone();
  const slug = hostname.endsWith(`.${ROOT_DOMAIN}`) ? hostname.replace(`.${ROOT_DOMAIN}`, "") : hostname;
  const domainMode = hostname.endsWith(`.${ROOT_DOMAIN}`) ? "subdomain" : "custom-domain";
  rewriteUrl.pathname = `/${slug}${pathname === "/" ? "" : pathname}`;

  requestHeaders.set("x-vfurst-org-host", hostname);
  requestHeaders.set("x-vfurst-org-slug", slug);
  requestHeaders.set("x-vfurst-domain-mode", domainMode);

  return NextResponse.rewrite(rewriteUrl, {
    request: {
      headers: requestHeaders
    }
  });
}

export const config = {
  matcher: ["/((?!monitoring|_next/static|_next/image|favicon.ico).*)"]
};
