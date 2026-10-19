import { adminTransferRegistration, requestRegistrationTransfer } from "@/actions/phase5-actions";
import { prisma } from "@vfurst/db";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCoreEventSettings } from "@/lib/event-settings";
import { formatDate } from "@/lib/i18n";
import { cancelRegistrationTransferRequest } from "@/actions/registration-transfer-actions";

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
              portalAccount: { select: { id: true, email: true, name: true } }
            }
          },
          type: true,
          portalAccount: { select: { id: true, email: true, name: true } }
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
  await prisma.registrationTransferRequest.updateMany({
    where: { eventId: event.id, orgId: event.orgId, status: "PENDING", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED" }
  });
  const requests = await prisma.registrationTransferRequest.findMany({
    where: { eventId: event.id, orgId: event.orgId },
    include: {
      requester: true,
      recipient: { select: { id: true, email: true, name: true } },
      sourceRegistration: { include: { type: true, portalAccount: { select: { id: true, email: true, name: true } } } }
    },
    orderBy: { createdAt: "desc" }
  });

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Registration</p>
          <h1>Transfers</h1>
          <p className="vf-muted">Invite recipients to accept ownership from their own account and review every decision.</p>
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
                  {registration.portalAccount.name ?? registration.portalAccount.email} - {registration.type.name}
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
          <h2>Admin override</h2>
          <p className="vf-muted">Use only when support must complete a transfer without recipient self-service.</p>
          <label>
            Source registration
            <select name="registrationId" required>
              {transferable.map((registration) => (
                <option key={registration.id} value={registration.id}>
                  {registration.portalAccount.name ?? registration.portalAccount.email} - {registration.type.name}
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
        <h2>Transfer requests</h2>
        <div className="vf-list">
          {requests.map((request) => {
            const status = request.status;
            return (
              <div key={request.id} className="vf-list-row">
                <span>{request.sourceRegistration.portalAccount.email} → {request.recipientEmail}</span>
                <small>
                  {request.sourceRegistration.type.name} · {status} · expires {formatDate(request.expiresAt, { dateStyle: "medium", timeStyle: "short" })}
                  {request.recipient ? ` · claimed by ${request.recipient.email}` : ""}
                </small>
                {request.status === "PENDING" ? (
                  <form action={cancelRegistrationTransferRequest}>
                    <input type="hidden" name="requestId" value={request.id} />
                    <Button label="Cancel request" type="submit" size="sm" variant="destructive" />
                  </form>
                ) : null}
              </div>
            );
          })}
          {requests.length === 0 ? <p className="vf-empty">No transfer requests have been created.</p> : null}
        </div>
      </section>

      <section className="vf-section">
        <h2>History</h2>
        <div className="vf-list">
          {transferred.map((registration) => (
            <div key={registration.id} className="vf-list-row">
              <span>{registration.portalAccount.name ?? registration.portalAccount.email}</span>
              <small>
                {registration.type.name} - {registration.status}
                {registration.transferredTo.length > 0 ? ` - transferred to ${registration.transferredTo.map((item) => item.portalAccount.name ?? item.portalAccount.email).join(", ")}` : ""}
              </small>
            </div>
          ))}
          {transferred.length === 0 ? <p className="vf-empty">Completed transfers will appear here.</p> : null}
        </div>
      </section>
    </div>
  );
}
