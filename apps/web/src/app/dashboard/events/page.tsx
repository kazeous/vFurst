import { EventsTable } from "@/app/dashboard/events/events-table";
import { formatDate } from "@/lib/i18n";
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
      orgId: true,
      org: { select: { status: true } }
    }
  });
  const orgIds = memberships.map((membership) => membership.orgId);
  const activeOrgIds = memberships.filter((membership) => membership.org.status === "ACTIVE").map((membership) => membership.orgId);
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
        actions={activeOrgIds.length > 0 ? <Button label="New event" href="/dashboard/events/new" variant="primary" /> : undefined}
      />
      <section className="vf-section">
        <EventsTable
          events={events.map((event) => ({
            id: event.id,
            name: event.name,
            orgName: event.org.name,
            status: event.status,
            startDate: formatDate(event.startDate),
            registrationCount: event.registrations.length,
            revenue: formatCurrency(
              event.orders
                .filter((order) => order.status === "PAID" && order.currency === event.currency)
                .reduce((sum, order) => sum + order.total, 0),
              event.currency
            )
          }))}
        />
      </section>
    </div>
  );
}
