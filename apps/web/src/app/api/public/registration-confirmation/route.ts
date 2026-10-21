import { prisma } from "@vfurst/db";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestPortalOrg } from "@/lib/portal-request";
import { getPortalAccount } from "@/lib/portal-account";

const querySchema = z.object({
  registrationId: z.string().uuid()
});

const responseHeaders = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff"
};

export async function GET(request: NextRequest) {
  const organization = await getRequestPortalOrg();
  const account = organization ? await getPortalAccount(organization) : null;
  if (!organization || !account) {
    // Registration confirmations are private account data. Return the same
    // response shape as an unknown registration so this endpoint cannot be
    // used to probe registration IDs before signing in.
    return NextResponse.json({ confirmed: false }, { status: 404, headers: responseHeaders });
  }

  const parsed = querySchema.safeParse({
    registrationId: request.nextUrl.searchParams.get("registrationId")
  });

  if (!parsed.success) {
    return NextResponse.json({ confirmed: false }, { status: 404, headers: responseHeaders });
  }

  const registration = await prisma.registration.findFirst({
    where: {
      id: parsed.data.registrationId,
      orgId: organization.id,
      portalAccountId: account.id
    },
    select: {
      approvalStatus: true,
      event: {
        select: {
          name: true
        }
      },
      type: {
        select: {
          name: true
        }
      },
      attendeeProfile: { select: { id: true, fullName: true, badgeName: true } }
    }
  });

  return NextResponse.json(
    registration
      ? {
          attendee: registration.attendeeProfile.fullName,
          approvalStatus: registration.approvalStatus,
          confirmed: true,
          event: registration.event.name,
          tier: registration.type.name
        }
      : { confirmed: false },
    { status: registration ? 200 : 404, headers: responseHeaders }
  );
}
