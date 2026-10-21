import { jsonError, requireApiKey, withRateHeaders } from "@/lib/api/auth";
import { prisma } from "@vfurst/db";

export async function GET(request: Request, { params }: { params: Promise<{ registrationId: string }> }) {
  const context = await requireApiKey(request, "read:registrations");

  if (context instanceof Response) {
    return context;
  }

  const { registrationId } = await params;
  const registration = await prisma.registration.findFirst({
    where: {
      id: registrationId,
      orgId: context.apiKey.orgId
    },
    include: {
      event: true,
      type: true,
      attendeeProfile: { select: { id: true, fullName: true, badgeName: true } },
      portalAccount: {
        select: {
          id: true,
          email: true,
          name: true
        }
      },
      addOns: true,
      badges: true
    }
  });

  if (!registration) {
    return jsonError("Registration not found.", 404, "not_found");
  }

  const { portalAccountId, portalAccount, attendeeProfile, ...record } = registration;
  return withRateHeaders(Response.json({ ...record, userId: portalAccountId, user: portalAccount, attendee: attendeeProfile }), context);
}
