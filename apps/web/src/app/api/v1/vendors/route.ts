import { paginated, parsePagination, requireApiKey, withRateHeaders } from "@/lib/api/auth";
import { prisma, type VendorApplicationStatus } from "@vfurst/db";

export async function GET(request: Request) {
  const context = await requireApiKey(request, "read:vendors");

  if (context instanceof Response) {
    return context;
  }

  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId");
  const status = url.searchParams.get("status") as VendorApplicationStatus | null;
  const { page, pageSize, skip, take } = parsePagination(request);
  const where = {
    orgId: context.apiKey.orgId,
    ...(eventId ? { eventId } : {}),
    ...(status ? { status } : {})
  };

  const [data, total] = await Promise.all([
    prisma.vendorApplication.findMany({
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
        portalAccount: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: url.searchParams.get("order") === "asc" ? "asc" : "desc"
      }
    }),
    prisma.vendorApplication.count({
      where
    })
  ]);

  return withRateHeaders(Response.json(paginated(data.map(({ portalAccountId, portalAccount, ...record }) => ({ ...record, userId: portalAccountId, user: portalAccount })), total, page, pageSize)), context);
}
