import { csvDownload } from "@/lib/csv";
import { requireEventPageAccess } from "@/lib/dashboard-access";
import { prisma, type CurrencyCode, type OrderItemType } from "@vfurst/db";

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

function sourceForOrder(itemTypes: OrderItemType[]) {
  const sources = Array.from(new Set(itemTypes.map(sourceForItem)));
  return sources.length === 1 ? sources[0] : "Mixed";
}

function currencyUnit(currency: CurrencyCode) {
  return currency === "USD" ? "cents" : "whole dong";
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
        portalAccount: { select: { id: true, email: true, name: true } }
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

  const paidOrders = orders.filter((order) => order.status === "PAID");
  const currencies = Array.from(new Set<CurrencyCode>([event.currency, ...orders.map((order) => order.currency)])).sort(
    (left, right) => (left === event.currency ? -1 : right === event.currency ? 1 : left.localeCompare(right))
  );
  const moneyRows = currencies.flatMap((currency) => {
    const currencyOrders = paidOrders.filter((order) => order.currency === currency);
    const unit = currencyUnit(currency);

    return [
      [`Paid revenue (${currency} ${unit})`, currencyOrders.reduce((sum, order) => sum + order.total, 0)],
      [`Collected fees (${currency} ${unit})`, currencyOrders.reduce((sum, order) => sum + order.platformFee, 0)]
    ];
  });
  const rows = [
    ["Metric", "Value"],
    ["Registrations", registrations.length],
    ["Checked in", registrations.filter((registration) => registration.status === "CHECKED_IN").length],
    ...moneyRows,
    [],
    ["Registration ID", "Attendee", "Email", "Type", "Status", "Created", "Checked in"],
    ...registrations.map((registration) => [
      registration.id,
      registration.portalAccount.name ?? "",
      registration.portalAccount.email,
      registration.type.name,
      registration.status,
      registration.createdAt.toISOString(),
      registration.checkedInAt?.toISOString() ?? ""
    ]),
    [],
    ["Order ID", "Source", "Currency", "Order total (minor units)", "Platform fee (minor units)", "Status", "Updated"],
    ...orders.map((order) => [
      order.id,
      sourceForOrder(order.items.map((item) => item.itemType)),
      order.currency,
      order.total,
      order.platformFee,
      order.status,
      order.updatedAt.toISOString()
    ])
  ];
  return csvDownload(rows, `analytics-${event.id}.csv`);
}
