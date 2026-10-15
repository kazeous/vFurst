import { InvalidTenantHostError } from "@vfurst/tenant-context";
import { NextResponse, type NextRequest } from "next/server";
import { getRootDomain, isPlatformHostname, normalizeHostname } from "./lib/platform-hosts";
import { canonicalPortalRedirect, centralPortalCandidate, portalHostKey } from "./lib/portal-canonical";
import { lookupPortalHostOrganization } from "./lib/portal-host-directory";
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

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = `/${slug}${pathname === "/" ? "" : pathname}`;

  return NextResponse.rewrite(rewriteUrl, {
    request: {
      headers: requestHeaders
    }
  });
}

export const config = {
  matcher: ["/((?!monitoring|_next/static|_next/image|favicon.ico).*)"],
  runtime: "nodejs"
};
