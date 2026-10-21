import { prisma } from "@vfurst/db";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listEventAttendees } from "@/lib/attendee-profiles";
import { getPortalAccount } from "@/lib/portal-account";
import { getCachedRequestPortalOrg } from "@/lib/portal-request";

const responseHeaders = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff"
};

export async function GET(request: NextRequest) {
  const org = await getCachedRequestPortalOrg();
  if (!org) return NextResponse.json({ account: null, attendees: null }, { status: 404, headers: responseHeaders });
  const eventId = z.string().uuid().safeParse(request.nextUrl.searchParams.get("eventId"));
  const [account, event] = await Promise.all([
    getPortalAccount(org),
    eventId.success ? prisma.event.findFirst({
      where: { id: eventId.data, orgId: org.id, status: "PUBLISHED" },
      select: { id: true, orgId: true, settings: true }
    }) : null
  ]);
  if (!account) return NextResponse.json({ account: null, attendees: null }, { status: 401, headers: responseHeaders });
  const publicAccount = { email: account.email, name: account.name };
  if (!eventId.success || !event) return NextResponse.json({ account: publicAccount, attendees: null }, { status: 404, headers: responseHeaders });
  return NextResponse.json({ account: publicAccount, ...await listEventAttendees(prisma, { account, event }) }, { headers: responseHeaders });
}
