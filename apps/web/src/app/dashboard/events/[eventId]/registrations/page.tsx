import { RegistrationsTable } from "@/app/dashboard/events/[eventId]/registrations/registrations-table";
import { formatDate } from "@/lib/i18n";
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
          portalAccount: { select: { id: true, email: true, name: true } }
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
            attendee: registration.portalAccount.name ?? registration.portalAccount.email,
            email: registration.portalAccount.email,
            type: registration.type.name,
            status: registration.status,
            approvalStatus: registration.approvalStatus,
            createdAt: formatDate(registration.createdAt)
          }))}
        />
      </section>
    </div>
  );
}
