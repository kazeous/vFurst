import { prisma, type OrderItemType } from "@vfurst/db";

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

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
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      registrations: {
        include: {
          type: true,
          user: true
        }
      },
      orders: {
        include: {
          items: true
        }
      }
    }
  });

  if (!event) {
    return Response.json({ error: "Event not found." }, { status: 404 });
  }

  const rows = [
    ["Metric", "Value"],
    ["Registrations", event.registrations.length],
    ["Checked in", event.registrations.filter((registration) => registration.status === "CHECKED_IN").length],
    ["Paid revenue cents", event.orders.filter((order) => order.status === "PAID").reduce((sum, order) => sum + order.total, 0)],
    ["Collected fees cents", event.orders.filter((order) => order.status === "PAID").reduce((sum, order) => sum + order.platformFee, 0)],
    [],
    ["Registration ID", "Attendee", "Email", "Type", "Status", "Created", "Checked in"],
    ...event.registrations.map((registration) => [
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
    ...event.orders.flatMap((order) =>
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
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="analytics-${eventId}.csv"`
    }
  });
}
