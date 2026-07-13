import { EventsTable } from "@/app/dashboard/events/events-table";
import { formatCurrency } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { requireDashboardUser } from "@/lib/dashboard-access";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const userId = await requireDashboardUser();
  const memberships = await prisma.orgMember.findMany({
    where: {
      userId,
      role: {
        in: ["OWNER", "ADMIN"]
      }
    },
    select: {
      orgId: true
    }
  });
  const orgIds = memberships.map((membership) => membership.orgId);
  const events = await prisma.event.findMany({
    where: {
      orgId: {
        in: orgIds
      }
    },
    orderBy: {
      startDate: "desc"
    },
    include: {
      org: true,
      registrations: true,
      orders: true
    }
  });

  return (
    <div className="vf-page">
      <PageHeader
        eyebrow="Event portfolio"
        title="Convention calendar"
        description="Track every draft, published, and archived convention in your organizer memberships."
        actions={orgIds.length > 0 ? <Button label="New event" href="/dashboard/events/new" variant="primary" /> : undefined}
      />
      <section className="vf-section">
        <EventsTable
          events={events.map((event) => ({
            id: event.id,
            name: event.name,
            orgName: event.org.name,
            status: event.status,
            startDate: event.startDate.toLocaleDateString(),
            registrationCount: event.registrations.length,
            revenue: formatCurrency(event.orders.reduce((sum, order) => sum + order.total, 0), event.currency)
          }))}
        />
      </section>
    </div>
  );
}
