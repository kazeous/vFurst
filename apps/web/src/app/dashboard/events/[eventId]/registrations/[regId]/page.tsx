import {
  cancelRegistration,
  confirmRegistration,
  createAttendeeNote,
  deleteAttendeeNote,
  refundRegistration,
  resendRegistrationEmail,
  transferRegistration,
  upgradeTier
} from "@/actions/registration-actions";
import { formatCurrency } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

export default async function RegistrationDetailPage({ params }: { params: Promise<{ eventId: string; regId: string }> }) {
  const { eventId, regId } = await params;
  const registration = await prisma.registration.findFirst({
    where: {
      id: regId,
      eventId
    },
    include: {
      addOns: {
        include: {
          addOnDefinition: true
        }
      },
      attendeeNotes: {
        orderBy: {
          createdAt: "desc"
        },
        include: {
          author: true
        }
      },
      badges: true,
      event: {
        include: {
          registrationTypes: {
            orderBy: {
              sortOrder: "asc"
            }
          }
        }
      },
      orderItems: {
        include: {
          order: true
        }
      },
      type: true,
      user: true
    }
  });

  if (!registration) {
    notFound();
  }

  const order = registration.orderItems[0]?.order;

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Registration detail</p>
          <h1>{registration.user.name ?? registration.user.email}</h1>
          <p className="vf-muted">
            {registration.type.name} - {registration.status}
          </p>
        </div>
        <div className="vf-actions">
          <form action={resendRegistrationEmail}>
            <input type="hidden" name="orgId" value={registration.orgId} />
            <input type="hidden" name="eventId" value={registration.eventId} />
            <input type="hidden" name="registrationId" value={registration.id} />
            <Button label="Confirm" type="submit" size="sm" />
          </form>
          <form action={cancelRegistration}>
            <input type="hidden" name="orgId" value={registration.orgId} />
            <input type="hidden" name="eventId" value={registration.eventId} />
            <input type="hidden" name="registrationId" value={registration.id} />
            <Button label="Cancel" type="submit" size="sm" variant="destructive" />
          </form>
          <form action={refundRegistration}>
            <input type="hidden" name="orgId" value={registration.orgId} />
            <input type="hidden" name="eventId" value={registration.eventId} />
            <input type="hidden" name="registrationId" value={registration.id} />
            <Button label="Refund" type="submit" size="sm" variant="destructive" />
          </form>
        </div>
      </header>
      <section className="vf-stat-grid">
        <div className="vf-stat-card">
          <p className="vf-label">Payment</p>
          <strong>{order?.status ?? "No order"}</strong>
          <span>{order ? formatCurrency(order.total) : "Manual registration"}</span>
        </div>
        <div className="vf-stat-card">
          <p className="vf-label">Badge</p>
          <strong>{registration.badgeNumber ?? "Pending"}</strong>
          <span>{registration.badges[0]?.barcodeData ?? "Badge preview not generated yet"}</span>
        </div>
        <div className="vf-stat-card">
          <p className="vf-label">Check-in</p>
          <strong>{registration.checkedInAt ? "Checked in" : "Not checked in"}</strong>
          <span>{registration.checkedInAt?.toLocaleString() ?? "Ready for Phase 5 scanner"}</span>
        </div>
      </section>
      <section className="vf-two-column">
        <div className="vf-section">
          <h2>Attendee info</h2>
          <dl className="vf-details">
            <dt>Email</dt>
            <dd>{registration.user.email}</dd>
            <dt>Tier</dt>
            <dd>{registration.type.name}</dd>
            <dt>Created</dt>
            <dd>{registration.createdAt.toLocaleString()}</dd>
          </dl>
          <h3>Add-ons</h3>
          <div className="vf-list">
            {registration.addOns.map((addOn) => (
              <div key={addOn.id} className="vf-list-row">
                <span>{addOn.addOnDefinition.name}</span>
                <small>
                  {addOn.quantity} x {formatCurrency(addOn.price)}
                </small>
              </div>
            ))}
            {registration.addOns.length === 0 ? <p className="vf-empty">No add-ons selected.</p> : null}
          </div>
        </div>
        <div className="vf-section">
          <h2>Upgrade tier</h2>
          <form action={upgradeTier} className="vf-form">
            <input type="hidden" name="orgId" value={registration.orgId} />
            <input type="hidden" name="eventId" value={registration.eventId} />
            <input type="hidden" name="registrationId" value={registration.id} />
            <label>
              New tier
              <select name="typeId" defaultValue={registration.typeId}>
                {registration.event.registrationTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
            <Button label="Upgrade" type="submit" />
          </form>
          <h2>Transfer</h2>
          <form action={transferRegistration} className="vf-form">
            <input type="hidden" name="orgId" value={registration.orgId} />
            <input type="hidden" name="eventId" value={registration.eventId} />
            <input type="hidden" name="registrationId" value={registration.id} />
            <label>
              New attendee name
              <input name="attendeeName" required />
            </label>
            <label>
              New attendee email
              <input name="attendeeEmail" type="email" required />
            </label>
            <Button label="Transfer registration" type="submit" />
          </form>
          <form action={confirmRegistration}>
            <input type="hidden" name="orgId" value={registration.orgId} />
            <input type="hidden" name="eventId" value={registration.eventId} />
            <input type="hidden" name="registrationId" value={registration.id} />
            <Button label="Resend email" type="submit" size="sm" />
          </form>
        </div>
      </section>
      <section className="vf-section">
        <h2>Staff notes</h2>
        <form action={createAttendeeNote} className="vf-form">
          <input type="hidden" name="orgId" value={registration.orgId} />
          <input type="hidden" name="eventId" value={registration.eventId} />
          <input type="hidden" name="registrationId" value={registration.id} />
          <label>
            Note
            <textarea name="content" rows={3} required />
          </label>
          <Button label="Add note" type="submit" />
        </form>
        <div className="vf-list">
          {registration.attendeeNotes.map((note) => (
            <div key={note.id} className="vf-list-row">
              <span>{note.content}</span>
              <small>
                {note.author.name ?? note.author.email} - {note.createdAt.toLocaleString()}
              </small>
              <form action={deleteAttendeeNote}>
                <input type="hidden" name="orgId" value={registration.orgId} />
                <input type="hidden" name="eventId" value={registration.eventId} />
                <input type="hidden" name="registrationId" value={registration.id} />
                <input type="hidden" name="noteId" value={note.id} />
                <Button label="Delete" type="submit" size="sm" variant="destructive" />
              </form>
            </div>
          ))}
          {registration.attendeeNotes.length === 0 ? <p className="vf-empty">No staff notes yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
