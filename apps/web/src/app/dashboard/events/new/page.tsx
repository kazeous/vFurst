import { EventWizard } from "@/app/dashboard/events/new/event-wizard";
import { prisma } from "@vfurst/db";

export default async function NewEventPage() {
  const organizations = await prisma.organization.findMany({
    orderBy: {
      name: "asc"
    },
    select: {
      id: true,
      name: true
    }
  });

  return (
    <div className="vf-page vf-narrow">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Events</p>
          <h1>Create event</h1>
        </div>
      </header>
      <EventWizard organizations={organizations} />
    </div>
  );
}

