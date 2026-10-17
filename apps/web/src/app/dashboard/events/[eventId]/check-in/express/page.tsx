import { ExpressKiosk } from "@/app/dashboard/events/[eventId]/check-in/express/express-kiosk";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
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
          approvalStatus: "APPROVED",
          status: {
            in: ["CONFIRMED", "CHECKED_IN"]
          }
        },
        include: {
          badges: true,
          portalAccount: { select: { id: true, email: true, name: true } }
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
    <div className="vf-page vf-focus-page">
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
          attendee: registration.portalAccount.name ?? registration.portalAccount.email,
          email: registration.portalAccount.email,
          code: registration.badges[0]?.barcodeData ?? registration.badgeNumber ?? registration.id,
          status: registration.status,
          badge: registration.badges[0]
            ? {
                id: registration.badges[0].id,
                pdfUrl: registration.badges[0].pdfUrl,
                zplData: registration.badges[0].zplData,
                generatedAt: registration.badges[0].generatedAt?.toISOString() ?? null,
                printedAt: registration.badges[0].printedAt?.toISOString() ?? null
              }
            : null
        }))}
      />
    </div>
  );
}
