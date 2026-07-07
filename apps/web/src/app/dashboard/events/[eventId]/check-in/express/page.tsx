import { ExpressKiosk } from "@/app/dashboard/events/[eventId]/check-in/express/express-kiosk";
import { prisma } from "@vfurst/db";
import { Button } from "@astryxdesign/core/Button";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ExpressPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      registrations: {
        where: {
          status: {
            in: ["CONFIRMED", "CHECKED_IN"]
          }
        },
        include: {
          badges: true,
          user: true
        },
        orderBy: {
          createdAt: "asc"
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
          <p className="vf-label">Check-in</p>
          <h1>Express mode</h1>
          <p className="vf-muted">Self-service kiosk flow for QR verification and badge printing.</p>
        </div>
        <Button label="Staff mode" href={`/dashboard/events/${event.id}/check-in`} />
      </header>

      <ExpressKiosk
        rows={event.registrations.map((registration) => ({
          id: registration.id,
          orgId: registration.orgId,
          eventId: registration.eventId,
          attendee: registration.user.name ?? registration.user.email,
          email: registration.user.email,
          code: registration.badges[0]?.barcodeData ?? registration.badgeNumber ?? registration.id,
          status: registration.status,
          badgePrinted: Boolean(registration.badges[0]?.printedAt)
        }))}
      />
    </div>
  );
}
