import { NextResponse, type NextRequest } from "next/server";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "vfurst.app";
const APP_HOST = `app.${ROOT_DOMAIN}`;

function getHostname(request: NextRequest) {
  return (request.headers.get("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
}

export function middleware(request: NextRequest) {
  const hostname = getHostname(request);
  const pathname = request.nextUrl.pathname;
  const isPlatformHost = hostname === ROOT_DOMAIN || hostname === APP_HOST || hostname === "localhost" || hostname === "127.0.0.1";

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") ||
    isPlatformHost
  ) {
    return NextResponse.next();
  }

  const rewriteUrl = request.nextUrl.clone();
  const slug = hostname.endsWith(`.${ROOT_DOMAIN}`) ? hostname.replace(`.${ROOT_DOMAIN}`, "") : hostname;
  rewriteUrl.pathname = `/${slug}${pathname === "/" ? "" : pathname}`;

  const response = NextResponse.rewrite(rewriteUrl);
  response.headers.set("x-vfurst-org-host", hostname);
  response.headers.set("x-vfurst-org-slug", slug);
  response.headers.set("x-vfurst-domain-mode", hostname.endsWith(`.${ROOT_DOMAIN}`) ? "subdomain" : "custom-domain");

  return response;
}

export const config = {
  matcher: ["/((?!monitoring|_next/static|_next/image|favicon.ico).*)"]
};
