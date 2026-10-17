import { requirePortalPageContext } from "@/lib/portal-context";
import { normalizeTransferEmail } from "@/lib/registration-transfer";
import { prisma } from "@vfurst/db";

export default async function AccountTransfersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const context = await requirePortalPageContext(orgSlug, "/account/transfers");
  const recipientEmail = normalizeTransferEmail(context.account.email);
  await prisma.registrationTransferRequest.updateMany({
    where: {
      orgId: context.org.id,
      recipientEmail,
      status: "PENDING",
      expiresAt: { lte: new Date() }
    },
    data: { status: "EXPIRED" }
  });
  const requests = await prisma.registrationTransferRequest.findMany({
    where: {
      orgId: context.org.id,
      recipientEmail
    },
    include: {
      event: true,
      org: true,
      sourceRegistration: { include: { type: true, portalAccount: { select: { id: true, email: true, name: true } } } }
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
                  {request.sourceRegistration.type.name} from {request.sourceRegistration.portalAccount.name ?? request.sourceRegistration.portalAccount.email}
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
