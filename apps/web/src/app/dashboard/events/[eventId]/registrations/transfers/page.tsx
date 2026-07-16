import { adminTransferRegistration, requestRegistrationTransfer } from "@/actions/phase5-actions";
import { prisma } from "@vfurst/db";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCoreEventSettings } from "@/lib/event-settings";

export const dynamic = "force-dynamic";

export default async function TransfersPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      registrations: {
        include: {
          transferredTo: {
            include: {
              user: true
            }
          },
          type: true,
          user: true
        },
        orderBy: {
          createdAt: "desc"
        }
      }
    }
  });

  if (!event) {
    notFound();
  }

  const transferable = event.registrations.filter((registration) => registration.status !== "TRANSFERRED" && registration.status !== "CANCELLED");
  const transferred = event.registrations.filter((registration) => registration.status === "TRANSFERRED" || registration.transferredFromId);
  const transfersAllowed = getCoreEventSettings(event.settings).allowTransfers;

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Registration</p>
          <h1>Transfers</h1>
          <p className="vf-muted">Send transfer requests and complete staff-approved ownership changes.</p>
        </div>
      </header>

      {transfersAllowed ? <section className="vf-two-column">
        <form action={requestRegistrationTransfer} className="vf-section vf-form">
          <h2>Request transfer</h2>
          <label>
            Existing registration
            <select name="registrationId" required>
              {transferable.map((registration) => (
                <option key={registration.id} value={registration.id}>
                  {registration.user.name ?? registration.user.email} - {registration.type.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Recipient email
            <input type="email" name="recipientEmail" required />
          </label>
          <Button label="Send transfer email" type="submit" variant="primary" />
        </form>

        <form action={adminTransferRegistration} className="vf-section vf-form">
          <h2>Complete transfer</h2>
          <label>
            Source registration
            <select name="registrationId" required>
              {transferable.map((registration) => (
                <option key={registration.id} value={registration.id}>
                  {registration.user.name ?? registration.user.email} - {registration.type.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            New attendee name
            <input name="attendeeName" required />
          </label>
          <label>
            New attendee email
            <input type="email" name="attendeeEmail" required />
          </label>
          <Button label="Transfer registration" type="submit" />
        </form>
      </section> : <section className="vf-section"><h2>Transfers disabled</h2><p className="vf-muted">Enable transfers in event settings before sending or completing a transfer.</p></section>}

      <section className="vf-section">
        <h2>History</h2>
        <div className="vf-list">
          {transferred.map((registration) => (
            <div key={registration.id} className="vf-list-row">
              <span>{registration.user.name ?? registration.user.email}</span>
              <small>
                {registration.type.name} - {registration.status}
                {registration.transferredTo.length > 0 ? ` - transferred to ${registration.transferredTo.map((item) => item.user.name ?? item.user.email).join(", ")}` : ""}
              </small>
            </div>
          ))}
          {transferred.length === 0 ? <p className="vf-empty">Completed transfers will appear here.</p> : null}
        </div>
      </section>
    </div>
  );
}
