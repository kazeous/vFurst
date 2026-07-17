import { getTenantWebEnvironment, TenantWebEnvironmentError } from "@/lib/environment";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const headers = {
  "cache-control": "no-store, max-age=0",
  "x-content-type-options": "nosniff"
};

export function GET() {
  try {
    getTenantWebEnvironment();
    return NextResponse.json(
      {
        status: "ok",
        runtime: "tenant-web",
        mode: "incremental-cutover",
        tenantRouting: "server-boundary-ready",
        organizerDashboard: "read-only-ready",
        database: "configured-not-probed",
        redis: "configured-not-probed"
      },
      { headers }
    );
  } catch (error) {
    if (error instanceof TenantWebEnvironmentError) {
      return NextResponse.json(
        {
          status: "misconfigured",
          runtime: "tenant-web",
          missingOrInvalid: error.issues.map((issue) => issue.name)
        },
        { status: 503, headers }
      );
    }
    throw error;
  }
}
