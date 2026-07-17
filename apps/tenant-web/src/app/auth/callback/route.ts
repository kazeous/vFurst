import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_COOKIE_NAMES,
  HOST_ONLY_TRANSACTION_COOKIE_POLICY
} from "@vfurst/auth";
import { completeTenantAuthorization } from "@/lib/auth-handoff";
import { getTenantWebEnvironment } from "@/lib/environment";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    return await completeTenantAuthorization(request, getTenantWebEnvironment());
  } catch {
    const response = NextResponse.json({ error: "authorization_failed" }, {
      status: 503,
      headers: { "cache-control": "no-store, max-age=0" }
    });
    response.cookies.set(AUTH_COOKIE_NAMES.tenantTransaction, "", {
      ...HOST_ONLY_TRANSACTION_COOKIE_POLICY,
      expires: new Date(0),
      maxAge: 0
    });
    return response;
  }
}
