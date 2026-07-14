import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { auth } from "@/lib/auth";
import { formatDate, formatDateRange } from "@/lib/i18n";
import { prisma } from "@vfurst/db";
import { CalendarCheck, ClipboardList, ScanLine, TicketCheck } from "lucide-react";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function statusVariant(status: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
  if (status === "PUBLISHED") return "success" as const;
  if (status === "ARCHIVED") return "neutral" as const;
  return "warning" as const;
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const memberships = await prisma.orgMember.findMany({
    where: { userId: session.user.id, role: { in: ["OWNER", "ADMIN"] } },
    select: { orgId: true, org: { select: { status: true } } }
  });
  const orgIds = memberships.map((membership) => membership.orgId);
  const activeOrgIds = memberships.filter((membership) => membership.org.status === "ACTIVE").map((membership) => membership.orgId);
  const canManageEvents = activeOrgIds.length > 0;
  const eventWhere = { orgId: { in: orgIds } };
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [events, registrationCount, checkedInToday, pendingVendors, pendingVolunteers] = await Promise.all([
    prisma.event.findMany({
      where: eventWhere,
      take: 6,
      orderBy: [{ startDate: "asc" }],
      include: {
        org: true,
        registrationTypes: { select: { maxCapacity: true } },
        _count: { select: { registrations: true, vendorApplications: true } }
      }
    }),
    prisma.registration.count({ where: { event: eventWhere } }),
    prisma.registration.count({ where: { event: eventWhere, checkedInAt: { gte: todayStart } } }),
    prisma.vendorApplication.count({ where: { event: eventWhere, status: "PENDING" } }),
    prisma.volunteerApplication.count({ where: { event: eventWhere, status: "PENDING" } })
  ]);

  const activeEvents = events.filter((event) => event.status === "PUBLISHED").length;
  const pendingReviews = pendingVendors + pendingVolunteers;
  const nextEvent = events.find((event) => event.endDate >= new Date() && event.status !== "ARCHIVED") ?? events[0];

  return (
    <div className="vf-page">
      <PageHeader
        eyebrow="Operations overview"
        title={`Welcome back${session.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}`}
        description="Monitor the work that needs attention and move quickly into the next convention."
        actions={canManageEvents ? <Button label="Create event" href="/dashboard/events/new" variant="primary" /> : undefined}
      />

      <section className="vf-stat-grid" aria-label="Workspace summary">
        <StatCard label="Active events" value={activeEvents.toString()} detail={`${events.length} total in your workspace`} icon={CalendarCheck} tone="info" />
        <StatCard label="Registrations" value={registrationCount.toLocaleString()} detail="Across events you manage" icon={TicketCheck} />
        <StatCard label="Pending reviews" value={pendingReviews.toString()} detail={`${pendingVendors} vendor · ${pendingVolunteers} volunteer`} icon={ClipboardList} tone={pendingReviews ? "warning" : "success"} />
        <StatCard label="Checked in today" value={checkedInToday.toLocaleString()} detail="Live attendee throughput" icon={ScanLine} tone="success" />
      </section>

      {nextEvent ? (
        <section className="vf-dashboard-overview-grid">
          <Card className="vf-next-event-card">
            <div className="vf-next-event-cover" aria-hidden="true">
              <span>{formatDate(nextEvent.startDate, { month: "short" })}</span>
              <strong>{new Date(nextEvent.startDate).getDate()}</strong>
            </div>
            <div className="vf-next-event-copy">
              <div className="vf-section-heading">
                <div>
                  <p className="vf-label">Next in your workspace</p>
                  <h2>{nextEvent.name}</h2>
                </div>
                <Badge label={nextEvent.status.toLowerCase()} variant={statusVariant(nextEvent.status)} />
              </div>
              <p className="vf-muted">{nextEvent.org.name} · {formatDateRange(nextEvent.startDate, nextEvent.endDate)}{nextEvent.venue ? ` · ${nextEvent.venue}` : ""}</p>
              <div className="vf-next-event-metrics">
                <div><strong>{nextEvent._count.registrations}</strong><span>registered</span></div>
                <div><strong>{nextEvent._count.vendorApplications}</strong><span>vendor applications</span></div>
                <div><strong>{nextEvent.registrationTypes.length}</strong><span>ticket types</span></div>
              </div>
              <div className="vf-actions">
                <Button label="Open event workspace" href={`/dashboard/events/${nextEvent.id}`} variant="primary" />
                <Button label="Staff check-in" href={`/dashboard/events/${nextEvent.id}/check-in`} />
              </div>
            </div>
          </Card>

          <Card className="vf-attention-card">
            <div className="vf-section-heading">
              <div><p className="vf-label">Queue</p><h2>Needs attention</h2></div>
              <Badge label={pendingReviews ? `${pendingReviews} open` : "Clear"} variant={pendingReviews ? "warning" : "success"} />
            </div>
            <div className="vf-attention-list">
              <a href={`/dashboard/events/${nextEvent.id}/vendors`}><span>Vendor applications</span><strong>{pendingVendors}</strong></a>
              <a href={`/dashboard/events/${nextEvent.id}/staff/applications`}><span>Volunteer applications</span><strong>{pendingVolunteers}</strong></a>
              <a href={`/dashboard/events/${nextEvent.id}/registrations`}><span>Attendee records</span><strong>{nextEvent._count.registrations}</strong></a>
            </div>
          </Card>
        </section>
      ) : canManageEvents ? (
        <EmptyState title="Your workspace is ready" description="Create an event to start configuring registration, staffing, vendors, and launch-day operations." actions={<Button label="Create your first event" href="/dashboard/events/new" variant="primary" />} />
      ) : (
        <EmptyState
          title="No organizer access"
          description="This account has not been granted an owner or administrator membership."
        />
      )}

      {events.length > 1 ? (
        <section className="vf-section">
          <div className="vf-section-heading">
            <div><p className="vf-label">Portfolio</p><h2>Event pulse</h2></div>
            <Button label="View all events" href="/dashboard/events" size="sm" />
          </div>
          <div className="vf-event-pulse-grid">
            {events.slice(0, 4).map((event) => (
              <a key={event.id} href={`/dashboard/events/${event.id}`} className="vf-event-pulse-card">
                <div><Badge label={event.status.toLowerCase()} variant={statusVariant(event.status)} /><span>{formatDate(event.startDate)}</span></div>
                <h3>{event.name}</h3>
                <p>{event.org.name}</p>
                <strong>{event._count.registrations.toLocaleString()} registrations</strong>
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
