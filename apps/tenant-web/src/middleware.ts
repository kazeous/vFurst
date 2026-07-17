import { InvalidTenantHostError } from "@vfurst/tenant-context";
import { NextResponse, type NextRequest } from "next/server";
import { getTenantWebEnvironment, TenantWebEnvironmentError } from "./lib/environment";
import { scrubVfurstInternalHeaders } from "./lib/request-headers";
import { createTenantWebHostPolicy, evaluateTenantWebShellHost } from "./lib/tenant-host-policy";

const noStoreHeaders = {
  "cache-control": "no-store, max-age=0",
  "content-type": "application/json; charset=utf-8"
};

function jsonError(status: number, code: string, message: string, extraHeaders?: Record<string, string>) {
  return new NextResponse(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { ...noStoreHeaders, ...extraHeaders }
  });
}

export function middleware(request: NextRequest) {
  let decision;
  try {
    const environment = getTenantWebEnvironment();
    decision = evaluateTenantWebShellHost(
      request.headers.get("host") ?? "",
      createTenantWebHostPolicy(environment)
    );
  } catch (error) {
    if (error instanceof TenantWebEnvironmentError) {
      return jsonError(503, "tenant_web_misconfigured", "Tenant web runtime configuration is incomplete.");
    }
    if (error instanceof InvalidTenantHostError) {
      return jsonError(400, "invalid_host", "The request Host header is invalid.");
    }
    throw error;
  }

  if (decision.kind === "reject-misdirected") {
    return jsonError(421, "misdirected_request", "This host does not belong to the tenant web runtime.");
  }
  if (
    (request.nextUrl.pathname === "/dashboard" || request.nextUrl.pathname.startsWith("/dashboard/")) &&
    (decision.kind !== "allow-shell" || decision.surface !== "console")
  ) {
    return jsonError(421, "misdirected_request", "Organizer routes are available only on the console host.");
  }
  const requestHeaders = scrubVfurstInternalHeaders(request.headers);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
