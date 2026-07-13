import { createWalkInRegistration } from "@/actions/phase5-actions";
import { BadgePrintControls } from "@/components/badges/badge-print-controls";
import { formatCurrency, formatMoneyInput } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CashierPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      registrationTypes: {
        orderBy: {
          sortOrder: "asc"
        }
      },
      registrations: {
        where: {
          createdAt: {
            gte: new Date(Date.now() - 1000 * 60 * 60 * 12)
          }
        },
        include: {
          badges: {
            orderBy: {
              createdAt: "desc"
            },
            take: 1
          },
          type: true,
          user: true
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 10
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
          <h1>Cashier desk</h1>
          <p className="vf-muted">Record collected payment, check in, then print from verified badge output.</p>
        </div>
        <Button label="Back to check-in" href={`/dashboard/events/${event.id}/check-in`} />
      </header>

      <section className="vf-two-column">
        <form action={createWalkInRegistration} className="vf-section vf-form">
          <input type="hidden" name="eventId" value={event.id} />
          <h2>Walk-in registration</h2>
          <label>
            Attendee name
            <input name="attendeeName" autoFocus required />
          </label>
          <label>
            Attendee email
            <input type="email" name="attendeeEmail" required />
          </label>
          <label>
            Registration type
            <select name="typeId" required>
              {event.registrationTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name} - {formatCurrency(type.price, event.currency)}
                </option>
              ))}
            </select>
          </label>
          <div className="vf-form-grid">
            <label>
              Amount collected
              <input
                type="number"
                name="amount"
                inputMode={event.currency === "VND" ? "numeric" : "decimal"}
                step={event.currency === "VND" ? "1" : "0.01"}
                min="0"
                defaultValue={event.registrationTypes[0] ? formatMoneyInput(event.registrationTypes[0].price, event.currency) : "0"}
              />
            </label>
            <label>
              Payment
              <select name="paymentMode" defaultValue="cash">
                <option value="cash">Cash received</option>
                <option value="card">External card terminal paid</option>
              </select>
            </label>
          </div>
          <Button label="Complete registration" type="submit" variant="primary" />
          <p className="vf-muted">
            The order is recorded as paid only after staff confirms collection. Badge output appears in recent activity when the render worker finishes.
          </p>
        </form>

        <section className="vf-section">
          <h2>Recent desk activity</h2>
          <div className="vf-list">
            {event.registrations.map((registration) => {
              const badge = registration.badges[0];

              return (
                <div key={registration.id} className="vf-list-row">
                  <span>{registration.user.name ?? registration.user.email}</span>
                  <small>
                    {registration.type.name} - {registration.status}
                  </small>
                  {badge ? (
                    <BadgePrintControls
                      badgeId={badge.id}
                      label={registration.user.name ?? registration.user.email}
                      pdfUrl={badge.pdfUrl}
                      zplData={badge.zplData}
                      generatedAt={badge.generatedAt?.toISOString() ?? null}
                      printedAt={badge.printedAt?.toISOString() ?? null}
                    />
                  ) : (
                    <small className="vf-muted">No badge template was available.</small>
                  )}
                </div>
              );
            })}
            {event.registrations.length === 0 ? <p className="vf-empty">New walk-ins will appear here.</p> : null}
          </div>
        </section>
      </section>
    </div>
  );
}
