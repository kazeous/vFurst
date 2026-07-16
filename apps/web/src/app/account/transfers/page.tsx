import { requirePublicAccount } from "@/lib/public-account";
import { normalizeTransferEmail } from "@/lib/registration-transfer";
import { prisma } from "@vfurst/db";

export default async function AccountTransfersPage() {
  const user = await requirePublicAccount("/account/transfers");
  const recipientEmail = normalizeTransferEmail(user.email);
  await prisma.registrationTransferRequest.updateMany({
    where: {
      OR: [{ recipientEmail }, { recipientUserId: user.id }],
      status: "PENDING",
      expiresAt: { lte: new Date() }
    },
    data: { status: "EXPIRED" }
  });
  const requests = await prisma.registrationTransferRequest.findMany({
    where: {
      OR: [{ recipientEmail }, { recipientUserId: user.id }]
    },
    include: {
      event: true,
      org: true,
      sourceRegistration: { include: { type: true, user: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  return (
    <section className="vf-stack">
      <div>
        <p className="vf-label">Ticket ownership</p>
        <h2>Transfer invitations</h2>
        <p className="vf-muted">Review invitations sent to the email address on this account.</p>
      </div>
      {requests.map((request) => {
        const status = request.status;
        return (
          <article key={request.id} className="vf-section">
            <div className="vf-page-header">
              <div>
                <p className="vf-label">{request.org.name}</p>
                <h3>{request.event.name}</h3>
                <p className="vf-muted">
                  {request.sourceRegistration.type.name} from {request.sourceRegistration.user.name ?? request.sourceRegistration.user.email}
                </p>
              </div>
              <strong>{status}</strong>
            </div>
            <p className="vf-muted">
              Sent {request.createdAt.toLocaleString()} · expires {request.expiresAt.toLocaleString()}
            </p>
            {status === "PENDING" ? (
              <p>Open the signed link in your invitation email to accept or decline this transfer.</p>
            ) : null}
          </article>
        );
      })}
      {requests.length === 0 ? <p className="vf-empty">No transfer invitations are linked to this account.</p> : null}
    </section>
  );
}
