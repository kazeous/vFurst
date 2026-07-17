import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_COOKIE_NAMES,
  HOST_ONLY_SESSION_COOKIE_POLICY
} from "@vfurst/auth";
import { logoutTenantSession } from "@/lib/auth-handoff";
import { getTenantWebEnvironment } from "@/lib/environment";

export const runtime = "nodejs";

function clearLocalSession(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAMES.tenantSession, "", {
    ...HOST_ONLY_SESSION_COOKIE_POLICY,
    expires: new Date(0),
    maxAge: 0
  });
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const environment = getTenantWebEnvironment();
    const logoutResponse = await logoutTenantSession(request, environment);
    if (logoutResponse.status !== 204 || request.nextUrl.searchParams.get("return") !== "manager") {
      return logoutResponse;
    }

    return clearLocalSession(
      NextResponse.redirect(new URL("/login", environment.managerUrl), {
        status: 303,
        headers: { "cache-control": "no-store, max-age=0" }
      })
    );
  } catch {
    return clearLocalSession(new NextResponse(null, {
      status: 204,
      headers: { "cache-control": "no-store, max-age=0" }
    }));
  }
}
