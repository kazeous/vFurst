import { publishEvent } from "@/actions/event-actions";
import { RegistrationTrendChart } from "@/app/dashboard/events/[eventId]/registration-trend-chart";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { BadgeDollarSign, ScanLine, TicketCheck } from "lucide-react";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function EventOverviewPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      org: true,
      orders: true,
      registrationTypes: {
        orderBy: {
          sortOrder: "asc"
        },
        include: {
          registrations: {
            include: {
              attendeeProfile: { select: { id: true, fullName: true, badgeName: true } },
              portalAccount: { select: { id: true, email: true, name: true } }
            },
            orderBy: {
              createdAt: "desc"
            }
          }
        }
      },
      registrations: {
        orderBy: {
          createdAt: "desc"
        },
        include: {
          attendeeProfile: { select: { id: true, fullName: true, badgeName: true } },
          portalAccount: { select: { id: true, email: true, name: true } },
          type: true
        }
      }
    }
  });

  if (!event) {
    notFound();
  }

  const paidOrders = event.orders.filter((order) => order.status === "PAID" && order.currency === event.currency);
  const paidRevenue = paidOrders.reduce((sum, order) => sum + order.total, 0);
  const platformFees = paidOrders.reduce((sum, order) => sum + order.platformFee, 0);
  const trendMap = new Map<string, number>();

  for (const registration of event.registrations) {
    const key = dateKey(registration.createdAt);
    trendMap.set(key, (trendMap.get(key) ?? 0) + 1);
  }

  const trend = Array.from(trendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, registrations]) => ({ date, registrations }));

  return (
    <div className="vf-page">
      <PageHeader
        eyebrow={event.org.name}
        title={event.name}
        description={event.description ?? event.venue ?? "Event operations workspace"}
        actions={
          <>
          <Badge label={event.status.toLowerCase()} variant={event.status === "PUBLISHED" ? "success" : event.status === "ARCHIVED" ? "neutral" : "warning"} />
          <Button label="Public registration" href={`/${event.org.subdomain}/register`} />
          {event.status !== "PUBLISHED" ? (
            <form action={publishEvent}>
              <input type="hidden" name="eventId" value={event.id} />
              <Button label="Publish" type="submit" variant="primary" />
            </form>
          ) : null}
          </>
        }
      />
      <section className="vf-stat-grid">
        <StatCard label="Registrations" value={event.registrations.length.toString()} detail="All attendee records" icon={TicketCheck} />
        <StatCard label="Paid revenue" value={formatCurrency(paidRevenue, event.currency)} detail="Gross paid order volume" icon={BadgeDollarSign} tone="success" />
        <StatCard label="Checked in" value={event.registrations.filter((registration) => registration.status === "CHECKED_IN").length.toString()} detail="Attendees through the door" icon={ScanLine} tone="info" />
        <StatCard label="Platform fees" value={formatCurrency(platformFees, event.currency)} detail="Registration and hotel fees" icon={BadgeDollarSign} />
      </section>
      <section className="vf-two-column">
        <div className="vf-section">
          <h2>Registration trend</h2>
          <RegistrationTrendChart data={trend.length > 0 ? trend : [{ date: dateKey(new Date()), registrations: 0 }]} />
        </div>
        <div className="vf-section">
          <h2>Capacity by tier</h2>
          <div className="vf-list">
            {event.registrationTypes.map((type) => {
              const capacity = type.maxCapacity ?? Math.max(type.registrations.length, 1);
              const percent = Math.min(Math.round((type.registrations.length / capacity) * 100), 100);

              return (
                <div key={type.id} className="vf-capacity-row">
                  <div>
                    <strong>{type.name}</strong>
                    <span>
                      {type.registrations.length} / {type.maxCapacity ?? "unlimited"}
                    </span>
                  </div>
                  <div className="vf-progress">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <section className="vf-section">
        <h2>Recent registrations</h2>
        <div className="vf-list">
          {event.registrations.slice(0, 8).map((registration) => (
            <a key={registration.id} className="vf-list-row" href={`/dashboard/events/${event.id}/registrations/${registration.id}`}>
              <span>{registration.attendeeProfile.fullName}</span>
              <small>
                {registration.type.name} - {registration.status}
              </small>
            </a>
          ))}
          {event.registrations.length === 0 ? <p className="vf-empty">No attendee registrations yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
