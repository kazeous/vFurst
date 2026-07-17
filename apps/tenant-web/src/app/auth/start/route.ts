import type { NextRequest } from "next/server";
import { beginTenantAuthorization } from "@/lib/auth-handoff";
import { getTenantWebEnvironment } from "@/lib/environment";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return beginTenantAuthorization(request, getTenantWebEnvironment());
}
