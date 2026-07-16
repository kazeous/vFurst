import { acceptRegistrationTransfer, declineRegistrationTransfer } from "@/actions/registration-transfer-actions";
import { Button } from "@/components/ui/button";
import { requirePublicAccount } from "@/lib/public-account";
import {
  getRegistrationTransferPath,
  hashRegistrationTransferToken,
  normalizeTransferEmail
} from "@/lib/registration-transfer";
import { prisma } from "@vfurst/db";
import { notFound } from "next/navigation";

export default async function AccountTransferDecisionPage({
  params,
  searchParams
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const [{ requestId }, query] = await Promise.all([params, searchParams]);
  const token = Array.isArray(query.token) ? query.token[0] : query.token;

  if (!token || token.length < 32 || token.length > 256) {
    notFound();
  }

  const user = await requirePublicAccount(getRegistrationTransferPath(requestId, token));
  const request = await prisma.registrationTransferRequest.findUnique({
    where: { id: requestId },
    include: {
      event: true,
      org: true,
      sourceRegistration: { include: { type: true, user: true } }
    }
  });

  if (
    !request ||
    request.tokenHash !== hashRegistrationTransferToken(token) ||
    normalizeTransferEmail(request.recipientEmail) !== normalizeTransferEmail(user.email)
  ) {
    notFound();
  }

  if (request.status === "PENDING" && request.expiresAt <= new Date()) {
    await prisma.registrationTransferRequest.updateMany({
      where: { id: request.id, status: "PENDING", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" }
    });
  }

  const status = request.status === "PENDING" && request.expiresAt <= new Date() ? "EXPIRED" : request.status;

  return (
    <section className="vf-section vf-stack">
      <div>
        <p className="vf-label">Registration transfer</p>
        <h2>{request.event.name}</h2>
        <p className="vf-muted">{request.org.name}</p>
      </div>
      <dl className="vf-details">
        <dt>From</dt>
        <dd>{request.sourceRegistration.user.name ?? request.sourceRegistration.user.email}</dd>
        <dt>Ticket</dt>
        <dd>{request.sourceRegistration.type.name}</dd>
        <dt>Invited account</dt>
        <dd>{request.recipientEmail}</dd>
        <dt>Expires</dt>
        <dd>{request.expiresAt.toLocaleString()}</dd>
        <dt>Status</dt>
        <dd>{status}</dd>
      </dl>
      {status === "PENDING" ? (
        <div className="vf-actions">
          <form action={acceptRegistrationTransfer}>
            <input type="hidden" name="requestId" value={request.id} />
            <input type="hidden" name="token" value={token} />
            <Button label="Accept transfer" type="submit" variant="primary" />
          </form>
          <form action={declineRegistrationTransfer}>
            <input type="hidden" name="requestId" value={request.id} />
            <input type="hidden" name="token" value={token} />
            <Button label="Decline transfer" type="submit" variant="destructive" />
          </form>
        </div>
      ) : (
        <p className="vf-muted">This invitation can no longer be used.</p>
      )}
    </section>
  );
}
