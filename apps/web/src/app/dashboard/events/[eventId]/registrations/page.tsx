import { RegistrationsTable } from "@/app/dashboard/events/[eventId]/registrations/registrations-table";
import { prisma } from "@vfurst/db";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RegistrationsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      registrations: {
        orderBy: {
          createdAt: "desc"
        },
        include: {
          type: true,
          user: true
        }
      }
    }
  });

  if (!event) {
    notFound();
  }

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Registration</p>
          <h1>All registrations</h1>
        </div>
      </header>
      <section className="vf-section">
        <RegistrationsTable
          eventId={event.id}
          rows={event.registrations.map((registration) => ({
            id: registration.id,
            eventId: registration.eventId,
            attendee: registration.user.name ?? registration.user.email,
            email: registration.user.email,
            type: registration.type.name,
            status: registration.status,
            approvalStatus: registration.approvalStatus,
            createdAt: registration.createdAt.toLocaleDateString()
          }))}
        />
      </section>
    </div>
  );
}
