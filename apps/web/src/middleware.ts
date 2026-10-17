import { InvalidTenantHostError } from "@vfurst/tenant-context";
import { NextResponse, type NextRequest } from "next/server";
import { getRootDomain, isPlatformHostname, normalizeHostname } from "./lib/platform-hosts";
import { canonicalPortalRedirect, centralPortalCandidate, portalHostKey } from "./lib/portal-canonical";
import { lookupPortalHostOrganization } from "./lib/portal-host-directory";
import { scrubVfurstInternalHeaders } from "./lib/request-headers";

const ROOT_DOMAIN = getRootDomain();
// next.config.ts rewrites a request carrying this header to /<portal key><path>.
// A NextResponse.rewrite here would skip the ISR cache: Next 15.5 matches the
// prerender manifest against the pre-rewrite pathname ("/register").
export const PORTAL_SLUG_HEADER = "x-vfurst-portal-slug";
const STATIC_FILE_EXTENSION =
  /[.](?:avif|bmp|css|csv|gif|ico|jpe?g|js|json|map|mjs|pdf|png|svg|txt|webmanifest|webp|woff2?|ttf|xml|zip)$/i;

// Next renders a server action's redirect target by fetching it from its own bind address
// (the production image binds 0.0.0.0) and keeps the original host only in x-forwarded-host.
// External traffic never arrives with these hosts: the proxy routes real hostnames only.
const SERVER_BIND_HOSTNAMES = new Set(["0.0.0.0", "127.0.0.1", "::", "::1", "localhost"]);

function getHostname(request: NextRequest) {
  const hostname = normalizeHostname(request.headers.get("host") ?? "");
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();

  return SERVER_BIND_HOSTNAMES.has(hostname) && forwardedHost ? normalizeHostname(forwardedHost) : hostname;
}

export function isKnownStaticAssetPath(pathname: string) {
  const lastSegment = pathname.split("/").at(-1) ?? "";
  return STATIC_FILE_EXTENSION.test(lastSegment);
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
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
    isKnownStaticAssetPath(pathname)
  ) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const platformHost = isPlatformHostname(hostname);
  const slug = portalHostKey(hostname, ROOT_DOMAIN);
  const domainMode = hostname.endsWith(`.${ROOT_DOMAIN}`) ? "subdomain" : "custom-domain";

  if (!platformHost) {
    requestHeaders.set("x-vfurst-org-host", hostname);
    requestHeaders.set("x-vfurst-org-slug", slug);
    requestHeaders.set("x-vfurst-domain-mode", domainMode);
  }

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const canRedirect = request.method === "GET" || request.method === "HEAD";
  if (platformHost) {
    const candidate = canRedirect ? centralPortalCandidate(pathname) : null;
    if (candidate) {
      const org = await lookupPortalHostOrganization(candidate.key);
      if (org) {
        const target = canonicalPortalRedirect({
          requestHostname: null, portalPath: candidate.portalPath, search: request.nextUrl.search, org
        });
        if (target) return NextResponse.redirect(target, 308);
      }
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (canRedirect) {
    const org = await lookupPortalHostOrganization(slug);
    if (org) {
      const target = canonicalPortalRedirect({
        requestHostname: hostname, portalPath: pathname, search: request.nextUrl.search, org
      });
      if (target) return NextResponse.redirect(target, 308);
    }
  }

  requestHeaders.set(PORTAL_SLUG_HEADER, slug);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!monitoring|_next/static|_next/image|favicon.ico).*)"],
  runtime: "nodejs"
};
