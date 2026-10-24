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
import { getCoreEventSettings } from "@/lib/event-settings";
import { requireEventPageAccess } from "@/lib/dashboard-access";
import { parseStoredEmergencyContacts } from "@/lib/emergency-contacts";
import { formatDate } from "@/lib/i18n";
import { formatPhone } from "@/lib/phone";
import { getCurrentPolicySummaries } from "@/lib/policy-documents";
import { buildAgreementRows, buildAnswerRows } from "@/lib/registration-details";
import { getRegistrationForm } from "@/lib/registration-form";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

export default async function RegistrationDetailPage({ params }: { params: Promise<{ eventId: string; regId: string }> }) {
  const { eventId, regId } = await params;
  const { event: authorizedEvent } = await requireEventPageAccess(eventId);
  const registration = await prisma.registration.findFirst({
    where: {
      id: regId,
      eventId: authorizedEvent.id,
      orgId: authorizedEvent.orgId
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
      attendeeProfile: { select: { id: true, fullName: true, badgeName: true, dateOfBirth: true, email: true, phone: true, emergencyContacts: true } },
      agreements: {
        where: { orgId: authorizedEvent.orgId, eventId: authorizedEvent.id },
        include: { version: { select: { id: true, version: true, title: true } }, attestedBy: { select: { name: true, email: true } } }
      },
      portalAccount: { select: { id: true, email: true, name: true } }
    }
  });

  if (!registration) {
    notFound();
  }

  const order = registration.orderItems[0]?.order;
  const transfersAllowed = getCoreEventSettings(registration.event.settings).allowTransfers;
  const form = getRegistrationForm(registration.event.registrationForm);
  const contacts = parseStoredEmergencyContacts(registration.attendeeProfile.emergencyContacts);
  const answers = buildAnswerRows(form.questions, registration.formResponses);
  const current = await getCurrentPolicySummaries(prisma, { orgId: registration.orgId, eventId: registration.eventId });
  const agreements = buildAgreementRows(current, registration.agreements);

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Registration detail</p>
          <h1>{registration.attendeeProfile.fullName}</h1>
          <p className="vf-muted">
            {registration.type.name} - payment {registration.status} - approval {registration.approvalStatus}
          </p>
        </div>
        <div className="vf-actions">
          <form action={resendRegistrationEmail}>
            <input type="hidden" name="registrationId" value={registration.id} />
            <Button label="Resend email" type="submit" size="sm" />
          </form>
          <form action={cancelRegistration}>
            <input type="hidden" name="registrationId" value={registration.id} />
            <Button label="Cancel" type="submit" size="sm" variant="destructive" />
          </form>
          <form action={refundRegistration}>
            <input type="hidden" name="registrationId" value={registration.id} />
            <Button label="Refund" type="submit" size="sm" variant="destructive" />
          </form>
        </div>
      </header>
      <section className="vf-stat-grid">
        <div className="vf-stat-card">
          <p className="vf-label">Payment</p>
          <strong>{order?.status ?? "No order"}</strong>
          <span>{order ? formatCurrency(order.total, order.currency) : "Manual registration"}</span>
        </div>
        <div className="vf-stat-card">
          <p className="vf-label">Badge</p>
          <strong>{registration.badgeNumber ?? "Pending"}</strong>
          <span>{registration.badges[0]?.barcodeData ?? "Badge preview not generated yet"}</span>
        </div>
        <div className="vf-stat-card">
          <p className="vf-label">Check-in</p>
          <strong>{registration.checkedInAt ? "Checked in" : "Not checked in"}</strong>
          <span>{registration.checkedInAt ? formatDate(registration.checkedInAt, { dateStyle: "medium", timeStyle: "short" }) : "Ready for Phase 5 scanner"}</span>
        </div>
      </section>
      <section className="vf-two-column">
        <div className="vf-section">
          <h2>Attendee info</h2>
          <dl className="vf-details">
            <dt>Email</dt>
            <dd>{registration.portalAccount.email}</dd>
            <dt>Badge name</dt>
            <dd>{registration.attendeeProfile.badgeName ?? "—"}</dd>
            <dt>Date of birth</dt>
            <dd>{registration.attendeeProfile.dateOfBirth ? formatDate(registration.attendeeProfile.dateOfBirth, { dateStyle: "medium", timeZone: "UTC" }) : "—"}</dd>
            <dt>Contact email</dt>
            <dd>{registration.attendeeProfile.email ?? "—"}</dd>
            <dt>Phone</dt>
            <dd>{registration.attendeeProfile.phone ?? "—"}</dd>
            <dt>Tier</dt>
            <dd>{registration.type.name}</dd>
            <dt>Created</dt>
            <dd>{formatDate(registration.createdAt, { dateStyle: "medium", timeStyle: "short" })}</dd>
          </dl>
          <h3>Add-ons</h3>
          <div className="vf-list">
            {registration.addOns.map((addOn) => (
              <div key={addOn.id} className="vf-list-row">
                <span>{addOn.addOnDefinition.name}</span>
                <small>
                  {addOn.quantity} x {formatCurrency(addOn.price, registration.event.currency)}
                </small>
              </div>
            ))}
            {registration.addOns.length === 0 ? <p className="vf-empty">No add-ons selected.</p> : null}
          </div>
        </div>
        <div className="vf-section">
          <h2>Upgrade tier</h2>
          <form action={upgradeTier} className="vf-form">
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
          {transfersAllowed ? (
            <form action={transferRegistration} className="vf-form">
              <p className="vf-muted">The recipient must sign in with the invited email and accept before ownership changes.</p>
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
          ) : <p className="vf-muted">Transfers are disabled in this event's registration policy.</p>}
          <form action={confirmRegistration}>
            <input type="hidden" name="registrationId" value={registration.id} />
            <Button label="Approve registration" type="submit" size="sm" />
          </form>
        </div>
      </section>
      {form.contacts.mode !== "off" || contacts.length ? <section className="vf-section">
        <h2>Emergency contacts</h2>
        {contacts.length ? <ul>{contacts.map((contact, index) => <li key={index}>{contact.name} · {formatPhone(contact)}</li>)}</ul> : <p>Not provided</p>}
      </section> : null}
      {answers.length ? <section className="vf-section">
        <h2>Answers</h2>
        <dl className="vf-review-list">{answers.map((answer) => <div key={answer.questionId}><dt>{answer.label}</dt><dd>{answer.value ?? "Not answered"}</dd></div>)}</dl>
      </section> : null}
      {agreements.length ? <section className="vf-section">
        <h2>Agreements</h2>
        <ul>{agreements.map((agreement) => <li key={agreement.documentId}>
          {agreement.acceptedAt ? <>
            {`${agreement.title} — v${agreement.acceptedVersion}${agreement.currentVersion !== null && agreement.acceptedVersion !== agreement.currentVersion ? ` (current v${agreement.currentVersion})` : ""}, ${formatDate(agreement.acceptedAt, { dateStyle: "medium", timeStyle: "short" })}, ${agreement.source === "STAFF" ? `attested by ${agreement.staffName}` : "by attendee"}`}
          </> : <>{agreement.title} — Not recorded</>}
        </li>)}</ul>
      </section> : null}
      <section className="vf-section">
        <h2>Staff notes</h2>
        <form action={createAttendeeNote} className="vf-form">
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
                {note.author.name ?? note.author.email} - {formatDate(note.createdAt, { dateStyle: "medium", timeStyle: "short" })}
              </small>
              <form action={deleteAttendeeNote}>
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
