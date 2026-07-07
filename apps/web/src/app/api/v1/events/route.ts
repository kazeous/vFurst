import { jsonError, paginated, parsePagination, requireApiKey, withRateHeaders } from "@/lib/api/auth";
import { prisma, type EventStatus } from "@vfurst/db";

export async function GET(request: Request) {
  const context = await requireApiKey(request, "read:events");

  if (context instanceof Response) {
    return context;
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") as EventStatus | null;
  const query = url.searchParams.get("q")?.trim();
  const { page, pageSize, skip, take } = parsePagination(request);
  const where = {
    orgId: context.apiKey.orgId,
    ...(status ? { status } : {}),
    ...(query
      ? {
          OR: [
            {
              name: {
                contains: query,
                mode: "insensitive" as const
              }
            },
            {
              venue: {
                contains: query,
                mode: "insensitive" as const
              }
            }
          ]
        }
      : {})
  };

  const [data, total] = await Promise.all([
    prisma.event.findMany({
      where,
      skip,
      take,
      orderBy: {
        startDate: url.searchParams.get("order") === "asc" ? "asc" : "desc"
      }
    }),
    prisma.event.count({
      where
    })
  ]);

  return withRateHeaders(Response.json(paginated(data, total, page, pageSize)), context);
}

export function POST() {
  return jsonError("The public API is read-only in Phase 6.", 405, "method_not_allowed");
}
