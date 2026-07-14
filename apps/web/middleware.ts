import { NextResponse, type NextRequest } from "next/server";
import { getRootDomain, isPlatformHostname, normalizeHostname } from "./src/lib/platform-hosts";

const ROOT_DOMAIN = getRootDomain();

function getHostname(request: NextRequest) {
  return normalizeHostname(request.headers.get("host") ?? "");
}

export function middleware(request: NextRequest) {
  const hostname = getHostname(request);
  const pathname = request.nextUrl.pathname;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") ||
    isPlatformHostname(hostname)
  ) {
    return NextResponse.next();
  }

  const rewriteUrl = request.nextUrl.clone();
  const slug = hostname.endsWith(`.${ROOT_DOMAIN}`) ? hostname.replace(`.${ROOT_DOMAIN}`, "") : hostname;
  const domainMode = hostname.endsWith(`.${ROOT_DOMAIN}`) ? "subdomain" : "custom-domain";
  rewriteUrl.pathname = `/${slug}${pathname === "/" ? "" : pathname}`;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-vfurst-org-host", hostname);
  requestHeaders.set("x-vfurst-org-slug", slug);
  requestHeaders.set("x-vfurst-domain-mode", domainMode);

  const response = NextResponse.rewrite(rewriteUrl, {
    request: {
      headers: requestHeaders
    }
  });
  response.headers.set("x-vfurst-org-host", hostname);
  response.headers.set("x-vfurst-org-slug", slug);
  response.headers.set("x-vfurst-domain-mode", domainMode);

  return response;
}

export const config = {
  matcher: ["/((?!monitoring|_next/static|_next/image|favicon.ico).*)"]
};
