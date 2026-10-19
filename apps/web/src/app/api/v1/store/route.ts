import { paginated, parsePagination, requireApiKey, withRateHeaders } from "@/lib/api/auth";
import { prisma } from "@vfurst/db";

export async function GET(request: Request) {
  const context = await requireApiKey(request, "read:store");

  if (context instanceof Response) {
    return context;
  }

  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId");
  const category = url.searchParams.get("category");
  const { page, pageSize, skip, take } = parsePagination(request);
  const where = {
    orgId: context.apiKey.orgId,
    archivedAt: null,
    ...(eventId ? { eventId } : {}),
    ...(category ? { category } : {})
  };

  const [data, total] = await Promise.all([
    prisma.storeProduct.findMany({
      where,
      skip,
      take,
      include: {
        event: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: url.searchParams.get("order") === "asc" ? "asc" : "desc"
      }
    }),
    prisma.storeProduct.count({
      where
    })
  ]);

  return withRateHeaders(Response.json(paginated(data, total, page, pageSize)), context);
}
