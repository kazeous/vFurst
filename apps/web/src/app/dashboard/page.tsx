import { StatCard } from "@/components/dashboard/stat-card";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [organizationCount, eventCount, registrationCount, revenue] = await Promise.all([
    prisma.organization.count(),
    prisma.event.count(),
    prisma.registration.count(),
    prisma.order.aggregate({
      _sum: {
        total: true
      }
    })
  ]);

  const recentEvents = await prisma.event.findMany({
    take: 5,
    orderBy: {
      updatedAt: "desc"
    },
    include: {
      org: true
    }
  });

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Operations</p>
          <h1>Dashboard</h1>
        </div>
        <Button label="New organization" href="/dashboard/organizations/new" variant="primary" />
      </header>
      <section className="vf-stat-grid" aria-label="Quick stats">
        <StatCard label="Organizations" value={organizationCount.toString()} detail="Active organizer accounts" progress={70} />
        <StatCard label="Events" value={eventCount.toString()} detail="Draft, published, and archived" progress={45} />
        <StatCard label="Attendees" value={registrationCount.toString()} detail="Registrations across events" progress={30} />
        <StatCard label="Revenue" value={`$${((revenue._sum.total ?? 0) / 100).toFixed(2)}`} detail="Gross order volume" progress={55} />
      </section>
      <section id="events" className="vf-section">
        <h2>Recent events</h2>
        <div className="vf-list">
          {recentEvents.length > 0 ? (
            recentEvents.map((event) => (
              <a key={event.id} className="vf-list-row" href={`/dashboard/organizations/${event.orgId}`}>
                <span>{event.name}</span>
                <small>
                  {event.org.name} - {event.status}
                </small>
              </a>
            ))
          ) : (
            <p className="vf-empty">No events yet. Create an organization, then add its first convention.</p>
          )}
        </div>
      </section>
    </div>
  );
}
