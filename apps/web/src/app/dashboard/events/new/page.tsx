import { EventWizard } from "@/app/dashboard/events/new/event-wizard";
import { requireDashboardUser } from "@/lib/dashboard-access";
import { prisma } from "@vfurst/db";
import { notFound } from "next/navigation";

export default async function NewEventPage() {
  const userId = await requireDashboardUser();
  const memberships = await prisma.orgMember.findMany({
    where: {
      userId,
      role: {
        in: ["OWNER", "ADMIN"]
      },
      org: { status: "ACTIVE" }
    },
    orderBy: { org: { name: "asc" } },
    select: {
      org: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
  const organizations = memberships.map(({ org }) => org);

  if (organizations.length === 0) {
    notFound();
  }

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
