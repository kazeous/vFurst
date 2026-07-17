import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_COOKIE_NAMES,
  HOST_ONLY_SESSION_COOKIE_POLICY
} from "@vfurst/auth";
import { logoutTenantSession } from "@/lib/auth-handoff";
import { getTenantWebEnvironment } from "@/lib/environment";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    return await logoutTenantSession(request, getTenantWebEnvironment());
  } catch {
    const response = new NextResponse(null, {
      status: 204,
      headers: { "cache-control": "no-store, max-age=0" }
    });
    response.cookies.set(AUTH_COOKIE_NAMES.tenantSession, "", {
      ...HOST_ONLY_SESSION_COOKIE_POLICY,
      expires: new Date(0),
      maxAge: 0
    });
    return response;
  }
}
