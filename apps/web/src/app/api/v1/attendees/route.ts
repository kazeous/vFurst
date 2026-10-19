import { paginated, parsePagination, requireApiKey, withRateHeaders } from "@/lib/api/auth";
import { prisma } from "@vfurst/db";

export async function GET(request: Request) {
  const context = await requireApiKey(request, "read:attendees");

  if (context instanceof Response) {
    return context;
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();
  const eventId = url.searchParams.get("eventId");
  const { page, pageSize, skip, take } = parsePagination(request);
  const where = {
    orgId: context.apiKey.orgId,
    registrations: {
      some: {
        orgId: context.apiKey.orgId,
        ...(eventId ? { eventId } : {})
      }
    },
    ...(query
      ? {
          OR: [
            {
              email: {
                contains: query,
                mode: "insensitive" as const
              }
            },
            {
              name: {
                contains: query,
                mode: "insensitive" as const
              }
            }
          ]
        }
      : {})
  };

  const [data, total] = await Promise.all([
    prisma.portalAccount.findMany({
      where,
      skip,
      take,
      select: {
        id: true,
        email: true,
        name: true,
        registrations: {
          where: {
            orgId: context.apiKey.orgId,
            ...(eventId ? { eventId } : {})
          },
          select: {
            id: true,
            eventId: true,
            status: true,
            badgeNumber: true
          }
        }
      },
      orderBy: {
        email: "asc"
      }
    }),
    prisma.portalAccount.count({
      where
    })
  ]);

  return withRateHeaders(Response.json(paginated(data, total, page, pageSize)), context);
}
