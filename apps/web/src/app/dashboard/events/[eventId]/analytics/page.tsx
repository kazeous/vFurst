import { AnalyticsCharts } from "@/app/dashboard/events/[eventId]/analytics/analytics-charts";
import { getOrganizationFeeReport } from "@/lib/billing/reports";
import { requireEventPageAccess } from "@/lib/dashboard-access";
import { formatCurrency } from "@/lib/registration/pricing";
import { prisma, type OrderItemType } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function increment(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function trendFromMap(map: Map<string, number>, valueKey: "registrations" | "checkIns"): Array<{ date: string; registrations?: number; checkIns?: number }> {
  const rows = Array.from(map.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, value]) => (valueKey === "registrations" ? { date, registrations: value } : { date, checkIns: value }));

  return rows.length > 0 ? rows : [{ date: dateKey(new Date()), [valueKey]: 0 }];
}

function revenueByType(items: Array<{ itemType: OrderItemType; unitPrice: number; quantity: number }>) {
  const totals = {
    Registration: 0,
    Store: 0,
    Hotel: 0,
    Vendor: 0
  };

  for (const item of items) {
    const amount = item.unitPrice * item.quantity;

    if (item.itemType === "REGISTRATION" || item.itemType === "ADDON") {
      totals.Registration += amount;
    } else if (item.itemType === "PRODUCT") {
      totals.Store += amount;
    } else if (item.itemType === "HOTEL") {
      totals.Hotel += amount;
    } else if (item.itemType === "VENDOR") {
      totals.Vendor += amount;
    }
  }

  return Object.entries(totals).map(([name, value]) => ({ name, value }));
}

export default async function EventAnalyticsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  await requireEventPageAccess(eventId);

  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      org: true,
      registrations: {
        include: {
          type: true
        },
        orderBy: {
          createdAt: "asc"
        }
      },
      registrationTypes: {
        include: {
          registrations: true
        },
        orderBy: {
          sortOrder: "asc"
        }
      },
      orders: {
        where: {
          status: "PAID"
        },
        include: {
          items: true
        }
      }
    }
  });

  if (!event) {
    notFound();
  }

  const feeReport = await getOrganizationFeeReport(event.orgId);
  const registrationTrendMap = new Map<string, number>();
  const checkInTrendMap = new Map<string, number>();

  for (const registration of event.registrations) {
    increment(registrationTrendMap, dateKey(registration.createdAt));

    if (registration.checkedInAt) {
      increment(checkInTrendMap, dateKey(registration.checkedInAt));
    }
  }

  let cumulative = 0;
  const checkInTrend = trendFromMap(checkInTrendMap, "checkIns").map((point) => {
    cumulative += point.checkIns ?? 0;
    return {
      date: point.date,
      checkIns: cumulative
    };
  });
  const paidItems = event.orders.flatMap((order) => order.items);
  const grossRevenue = event.orders.reduce((sum, order) => sum + order.total, 0);
  const platformFees = event.orders.reduce((sum, order) => sum + order.platformFee, 0);
  const checkedIn = event.registrations.filter((registration) => registration.status === "CHECKED_IN").length;

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Event analytics</p>
          <h1>{event.name}</h1>
          <p className="vf-muted">Registration, revenue, check-in, capacity, and fee reconciliation signals.</p>
        </div>
        <Button label="Export CSV" href={`/dashboard/events/${event.id}/analytics/export`} variant="primary" />
      </header>
      <section className="vf-stat-grid">
        <div className="vf-stat-card">
          <p className="vf-label">Registrations</p>
          <strong>{event.registrations.length}</strong>
          <span>Total attendee records</span>
        </div>
        <div className="vf-stat-card">
          <p className="vf-label">Check-in rate</p>
          <strong>{event.registrations.length ? Math.round((checkedIn / event.registrations.length) * 100) : 0}%</strong>
          <span>{checkedIn} checked in</span>
        </div>
        <div className="vf-stat-card">
          <p className="vf-label">Gross revenue</p>
          <strong>{formatCurrency(grossRevenue, event.currency)}</strong>
          <span>Paid order volume</span>
        </div>
        <div className="vf-stat-card">
          <p className="vf-label">Collected fees</p>
          <strong>{formatCurrency(platformFees, event.currency)}</strong>
          <span>Event paid orders</span>
        </div>
      </section>
      <AnalyticsCharts
        registrationTrend={trendFromMap(registrationTrendMap, "registrations")}
        checkInTrend={checkInTrend}
        revenue={revenueByType(paidItems)}
        capacity={event.registrationTypes.map((type) => ({
          name: type.name,
          registered: type.registrations.length,
          capacity: type.maxCapacity ?? Math.max(type.registrations.length, 1)
        }))}
      />
      <section className="vf-section">
        <h2>Fee collection summary</h2>
        <div className="vf-table">
          <div className="vf-table-head vf-four-col">
            <span>Type</span>
            <span>Expected</span>
            <span>Collected</span>
            <span>Basis</span>
          </div>
          {feeReport.lines.map((line) => (
            <div key={line.label} className="vf-table-row vf-four-col">
              <strong>{line.label}</strong>
              <span>{formatCurrency(line.expected, event.currency)}</span>
              <span>{formatCurrency(line.collected, event.currency)}</span>
              <span>{line.basis}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
