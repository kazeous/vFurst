import { paginated, parsePagination, requireApiKey, withRateHeaders } from "@/lib/api/auth";
import { prisma, type RegistrationStatus } from "@vfurst/db";

export async function GET(request: Request) {
  const context = await requireApiKey(request, "read:registrations");

  if (context instanceof Response) {
    return context;
  }

  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId");
  const status = url.searchParams.get("status") as RegistrationStatus | null;
  const { page, pageSize, skip, take } = parsePagination(request);
  const where = {
    orgId: context.apiKey.orgId,
    ...(eventId ? { eventId } : {}),
    ...(status ? { status } : {})
  };

  const [data, total] = await Promise.all([
    prisma.registration.findMany({
      omit: { formResponses: true },
      where,
      skip,
      take,
      include: {
        event: {
          select: {
            id: true,
            name: true
          }
        },
        type: true,
        attendeeProfile: { select: { id: true, fullName: true, badgeName: true } },
        portalAccount: {
          select: {
            id: true,
            email: true,
            name: true
          }
        },
        badges: true
      },
      orderBy: {
        createdAt: url.searchParams.get("order") === "asc" ? "asc" : "desc"
      }
    }),
    prisma.registration.count({
      where
    })
  ]);

  return withRateHeaders(Response.json(paginated(data.map(({ portalAccountId, portalAccount, attendeeProfile, ...record }) => ({ ...record, userId: portalAccountId, user: portalAccount, attendee: attendeeProfile })), total, page, pageSize)), context);
}
