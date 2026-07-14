import { csvDownload } from "@/lib/csv";
import { requireEventPageAccess } from "@/lib/dashboard-access";
import { prisma, type OrderItemType } from "@vfurst/db";

function sourceForItem(itemType: OrderItemType) {
  if (itemType === "PRODUCT") {
    return "Store";
  }

  if (itemType === "HOTEL") {
    return "Hotel";
  }

  if (itemType === "VENDOR") {
    return "Vendor";
  }

  return "Registration";
}

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { event } = await requireEventPageAccess(eventId);
  const [registrations, orders] = await Promise.all([
    prisma.registration.findMany({
      where: {
        eventId: event.id,
        orgId: event.orgId,
        type: {
          eventId: event.id,
          orgId: event.orgId
        }
      },
      include: {
        type: true,
        user: true
      },
      orderBy: {
        createdAt: "asc"
      }
    }),
    prisma.order.findMany({
      where: {
        eventId: event.id,
        orgId: event.orgId
      },
      include: {
        items: {
          where: {
            orgId: event.orgId
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    })
  ]);

  const rows = [
    ["Metric", "Value"],
    ["Registrations", registrations.length],
    ["Checked in", registrations.filter((registration) => registration.status === "CHECKED_IN").length],
    ["Paid revenue cents", orders.filter((order) => order.status === "PAID").reduce((sum, order) => sum + order.total, 0)],
    ["Collected fees cents", orders.filter((order) => order.status === "PAID").reduce((sum, order) => sum + order.platformFee, 0)],
    [],
    ["Registration ID", "Attendee", "Email", "Type", "Status", "Created", "Checked in"],
    ...registrations.map((registration) => [
      registration.id,
      registration.user.name ?? "",
      registration.user.email,
      registration.type.name,
      registration.status,
      registration.createdAt.toISOString(),
      registration.checkedInAt?.toISOString() ?? ""
    ]),
    [],
    ["Order ID", "Source", "Total cents", "Platform fee cents", "Status", "Updated"],
    ...orders.flatMap((order) =>
      order.items.map((item) => [
        order.id,
        sourceForItem(item.itemType),
        item.unitPrice * item.quantity,
        order.platformFee,
        order.status,
        order.updatedAt.toISOString()
      ])
    )
  ];
  return csvDownload(rows, `analytics-${event.id}.csv`);
}
