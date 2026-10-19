import { NextResponse } from "next/server";
import { getPortalAccount } from "@/lib/portal-account";
import { getRequestPortalOrg } from "@/lib/portal-request";

const responseHeaders = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff"
};

export async function GET() {
  const org = await getRequestPortalOrg();
  if (!org) {
    return NextResponse.json({ account: null }, { status: 404, headers: responseHeaders });
  }

  const account = await getPortalAccount(org);
  return NextResponse.json(
    { account: account ? { email: account.email, name: account.name } : null },
    { headers: responseHeaders }
  );
}
