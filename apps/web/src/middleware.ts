import { InvalidTenantHostError } from "@vfurst/tenant-context";
import { NextResponse, type NextRequest } from "next/server";
import { getRootDomain, isPlatformHostname, normalizeHostname } from "./lib/platform-hosts";
import { scrubVfurstInternalHeaders } from "./lib/request-headers";

const ROOT_DOMAIN = getRootDomain();
const STATIC_FILE_EXTENSION =
  /[.](?:avif|bmp|css|csv|gif|ico|jpe?g|js|json|map|mjs|pdf|png|svg|txt|webmanifest|webp|woff2?|ttf|xml|zip)$/i;

function getHostname(request: NextRequest) {
  return normalizeHostname(request.headers.get("host") ?? "");
}

export function isKnownStaticAssetPath(pathname: string) {
  const lastSegment = pathname.split("/").at(-1) ?? "";
  return STATIC_FILE_EXTENSION.test(lastSegment);
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
    isKnownStaticAssetPath(pathname) ||
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
