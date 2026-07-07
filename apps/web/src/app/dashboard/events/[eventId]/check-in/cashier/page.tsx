import { createWalkInRegistration } from "@/actions/phase5-actions";
import { prisma } from "@vfurst/db";
import { Button } from "@astryxdesign/core/Button";
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
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Check-in</p>
          <h1>Cashier desk</h1>
          <p className="vf-muted">Create, collect payment, check in, and print a walk-in badge in one flow.</p>
        </div>
        <Button label="Back to check-in" href={`/dashboard/events/${event.id}/check-in`} />
      </header>

      <section className="vf-two-column">
        <form action={createWalkInRegistration} className="vf-section vf-form">
          <input type="hidden" name="orgId" value={event.orgId} />
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
                  {type.name} - ${(type.price / 100).toFixed(2)}
                </option>
              ))}
            </select>
          </label>
          <div className="vf-form-grid">
            <label>
              Amount collected
              <input name="amount" inputMode="decimal" defaultValue={event.registrationTypes[0] ? (event.registrationTypes[0].price / 100).toFixed(2) : "0.00"} />
            </label>
            <label>
              Payment
              <select name="paymentMode" defaultValue="cash">
                <option value="cash">Cash</option>
                <option value="card">Card terminal</option>
              </select>
            </label>
          </div>
          <Button label="Complete and print" type="submit" variant="primary" />
          <p className="vf-muted">Keyboard flow: name, email, tier, amount, payment mode, Enter.</p>
        </form>

        <section className="vf-section">
          <h2>Recent desk activity</h2>
          <div className="vf-list">
            {event.registrations.map((registration) => (
              <div key={registration.id} className="vf-list-row">
                <span>{registration.user.name ?? registration.user.email}</span>
                <small>
                  {registration.type.name} - {registration.status}
                </small>
              </div>
            ))}
            {event.registrations.length === 0 ? <p className="vf-empty">New walk-ins will appear here.</p> : null}
          </div>
        </section>
      </section>
    </div>
  );
}
