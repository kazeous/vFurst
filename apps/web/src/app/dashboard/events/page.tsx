import { EventsTable } from "@/app/dashboard/events/events-table";
import { formatCurrency } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const events = await prisma.event.findMany({
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
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Events</p>
          <h1>Convention calendar</h1>
        </div>
        <Button label="New event" href="/dashboard/events/new" variant="primary" />
      </header>
      <section className="vf-section">
        <EventsTable
          events={events.map((event) => ({
            id: event.id,
            name: event.name,
            orgName: event.org.name,
            status: event.status,
            startDate: event.startDate.toLocaleDateString(),
            registrationCount: event.registrations.length,
            revenue: formatCurrency(event.orders.reduce((sum, order) => sum + order.total, 0))
          }))}
        />
      </section>
    </div>
  );
}

