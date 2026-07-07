import { paginated, parsePagination, requireApiKey, withRateHeaders } from "@/lib/api/auth";
import { prisma } from "@vfurst/db";

export async function GET(request: Request) {
  const context = await requireApiKey(request, "read:badges");

  if (context instanceof Response) {
    return context;
  }

  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId");
  const printed = url.searchParams.get("printed");
  const { page, pageSize, skip, take } = parsePagination(request);
  const where = {
    orgId: context.apiKey.orgId,
    ...(printed === "true" ? { printedAt: { not: null } } : {}),
    ...(printed === "false" ? { printedAt: null } : {}),
    ...(eventId
      ? {
          registration: {
            eventId
          }
        }
      : {})
  };

  const [data, total] = await Promise.all([
    prisma.badge.findMany({
      where,
      skip,
      take,
      include: {
        template: {
          select: {
            id: true,
            name: true
          }
        },
        registration: {
          include: {
            event: {
              select: {
                id: true,
                name: true
              }
            },
            user: {
              select: {
                id: true,
                email: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: url.searchParams.get("order") === "asc" ? "asc" : "desc"
      }
    }),
    prisma.badge.count({
      where
    })
  ]);

  return withRateHeaders(Response.json(paginated(data, total, page, pageSize)), context);
}
