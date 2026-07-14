import { prisma } from "@vfurst/db";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  orgSlug: z.string().trim().min(1).max(253),
  registrationId: z.string().uuid()
});

const responseHeaders = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff"
};

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    orgSlug: request.nextUrl.searchParams.get("orgSlug"),
    registrationId: request.nextUrl.searchParams.get("registrationId")
  });

  if (!parsed.success) {
    return NextResponse.json({ confirmed: false }, { status: 404, headers: responseHeaders });
  }

  const normalizedSlug = parsed.data.orgSlug.toLowerCase();
  const organization = await prisma.organization.findFirst({
    where: {
      status: "ACTIVE",
      OR: [{ subdomain: normalizedSlug }, { slug: normalizedSlug }, { customDomain: normalizedSlug }]
    },
    select: {
      id: true
    }
  });

  if (!organization) {
    return NextResponse.json({ confirmed: false }, { status: 404, headers: responseHeaders });
  }

  const registration = await prisma.registration.findFirst({
    where: {
      id: parsed.data.registrationId,
      orgId: organization.id
    },
    select: {
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
      user: {
        select: {
          email: true,
          name: true
        }
      }
    }
  });

  return NextResponse.json(
    registration
      ? {
          attendee: registration.user.name ?? registration.user.email,
          confirmed: true,
          event: registration.event.name,
          tier: registration.type.name
        }
      : { confirmed: false },
    { status: registration ? 200 : 404, headers: responseHeaders }
  );
}
