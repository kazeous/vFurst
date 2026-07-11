import { publishEvent } from "@/actions/event-actions";
import { RegistrationTrendChart } from "@/app/dashboard/events/[eventId]/registration-trend-chart";
import { StatCard } from "@/components/dashboard/stat-card";
import { formatCurrency } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
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
              user: true
            },
            orderBy: {
              createdAt: "desc"
            }
          }
        }
      },
      registrations: {
        take: 8,
        orderBy: {
          createdAt: "desc"
        },
        include: {
          user: true,
          type: true
        }
      }
    }
  });

  if (!event) {
    notFound();
  }

  const paidRevenue = event.orders.filter((order) => order.status === "PAID").reduce((sum, order) => sum + order.total, 0);
  const platformFees = event.orders.filter((order) => order.status === "PAID").reduce((sum, order) => sum + order.platformFee, 0);
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
      <header className="vf-page-header">
        <div>
          <p className="vf-label">{event.org.name}</p>
          <h1>{event.name}</h1>
          <p className="vf-muted">{event.description ?? event.venue ?? "Event workspace"}</p>
        </div>
        <div className="vf-actions">
          <Button label="Public registration" href={`/${event.org.subdomain}/register`} />
          {event.status !== "PUBLISHED" ? (
            <form action={publishEvent}>
              <input type="hidden" name="orgId" value={event.orgId} />
              <input type="hidden" name="eventId" value={event.id} />
              <Button label="Publish" type="submit" variant="primary" />
            </form>
          ) : null}
        </div>
      </header>
      <section className="vf-stat-grid">
        <StatCard label="Registrations" value={event.registrations.length.toString()} detail="All attendee records" progress={65} />
        <StatCard label="Paid revenue" value={formatCurrency(paidRevenue, event.currency)} detail="Gross paid order volume" progress={70} />
        <StatCard label="Platform fees" value={formatCurrency(platformFees, event.currency)} detail="Registration and hotel platform fees" progress={40} />
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
          {event.registrations.map((registration) => (
            <a key={registration.id} className="vf-list-row" href={`/dashboard/events/${event.id}/registrations/${registration.id}`}>
              <span>{registration.user.name ?? registration.user.email}</span>
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
