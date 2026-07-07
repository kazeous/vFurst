import { CheckInPanel } from "@/app/dashboard/events/[eventId]/check-in/check-in-panel";
import { prisma } from "@vfurst/db";
import { Button } from "@astryxdesign/core/Button";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CheckInPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      registrations: {
        include: {
          addOns: {
            include: {
              addOnDefinition: true
            }
          },
          badges: true,
          orderItems: {
            include: {
              order: true
            }
          },
          type: true,
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
          <h1>Staff check-in</h1>
          <p className="vf-muted">Search, scan, confirm payment, and check attendees in.</p>
        </div>
        <div className="vf-actions">
          <Button label="Cashier" href={`/dashboard/events/${event.id}/check-in/cashier`} />
          <Button label="Express" href={`/dashboard/events/${event.id}/check-in/express`} variant="primary" />
        </div>
      </header>

      <CheckInPanel
        rows={event.registrations.map((registration) => ({
          id: registration.id,
          orgId: registration.orgId,
          eventId: registration.eventId,
          attendee: registration.user.name ?? registration.user.email,
          email: registration.user.email,
          type: registration.type.name,
          status: registration.status,
          badgeNumber: registration.badgeNumber,
          paid: registration.orderItems.some((item) => item.order.status === "PAID"),
          checkedInAt: registration.checkedInAt?.toISOString() ?? null,
          badge: registration.badges[0]
            ? {
                id: registration.badges[0].id,
                barcodeData: registration.badges[0].barcodeData,
                printedAt: registration.badges[0].printedAt?.toISOString() ?? null
              }
            : null,
          addOns: registration.addOns.map((addOn) => `${addOn.addOnDefinition.name} x${addOn.quantity}`)
        }))}
      />
    </div>
  );
}
