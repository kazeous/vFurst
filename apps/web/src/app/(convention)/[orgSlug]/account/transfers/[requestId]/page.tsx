import { acceptRegistrationTransfer, declineRegistrationTransfer } from "@/actions/registration-transfer-actions";
import { Alert } from "@/components/ui/alert";
import { ActionStateForm } from "@/components/action-state-form";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/i18n";
import { requirePortalPageContext } from "@/lib/portal-context";
import {
  getRegistrationTransferPath,
  hashRegistrationTransferToken,
  normalizeTransferEmail
} from "@/lib/registration-transfer";
import { prisma } from "@vfurst/db";
import { notFound } from "next/navigation";
import { listEventAttendees } from "@/lib/attendee-profiles";
import { pickInitialAttendee } from "../../../register/attendee-selection";
import { TransferAttendeeSelection } from "../../../register/attendee-step";

const noticeMessages: Record<string, { variant: "success" | "info" | "error"; message: string }> = {
  accepted: { variant: "success", message: "Transfer accepted. The registration now belongs to your account." },
  declined: { variant: "info", message: "Transfer declined. The original attendee keeps the registration." },
  expired: { variant: "error", message: "This transfer invitation has expired." },
  used: { variant: "error", message: "This transfer invitation has already been used. The current status is shown below." },
  invalid: { variant: "error", message: "This transfer invitation is invalid or has already been used. The current status is shown below." },
  ineligible: { variant: "error", message: "The source registration is no longer eligible for transfer." },
  policy: { variant: "error", message: "The transfer could not be completed because of the event's registration policy (capacity or per-account limit)." }
};

export default async function AccountTransferDecisionPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string; requestId: string }>;
  searchParams: Promise<{ token?: string | string[]; notice?: string | string[] }>;
}) {
  const [{ orgSlug, requestId }, query] = await Promise.all([params, searchParams]);
  const token = Array.isArray(query.token) ? query.token[0] : query.token;
  const noticeKey = Array.isArray(query.notice) ? query.notice[0] : query.notice;
  const notice = noticeKey ? noticeMessages[noticeKey] : undefined;

  if (!token || token.length < 32 || token.length > 256) {
    notFound();
  }

  const context = await requirePortalPageContext(orgSlug, getRegistrationTransferPath(requestId, token));
  const request = await prisma.registrationTransferRequest.findFirst({
    where: { id: requestId, orgId: context.org.id, recipientEmail: normalizeTransferEmail(context.account.email) },
    include: {
      event: true,
      org: true,
      sourceRegistration: { include: { type: true, portalAccount: { select: { id: true, email: true, name: true } } } }
    }
  });

  if (
    !request ||
    request.tokenHash !== hashRegistrationTransferToken(token) ||
    normalizeTransferEmail(request.recipientEmail) !== normalizeTransferEmail(context.account.email)
  ) {
    notFound();
  }

  if (request.status === "PENDING" && request.expiresAt <= new Date()) {
    await prisma.registrationTransferRequest.updateMany({
      where: { id: request.id, orgId: context.org.id, recipientEmail: normalizeTransferEmail(context.account.email), status: "PENDING", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" }
    });
  }

  const status = request.status === "PENDING" && request.expiresAt <= new Date() ? "EXPIRED" : request.status;
  const { attendees } = await listEventAttendees(prisma, { account: context.account, event: request.event });
  const initialAttendee = pickInitialAttendee(attendees, null) ?? "new";

  return (
    <section className="vf-section vf-stack">
      <div>
        <p className="vf-label">Registration transfer</p>
        <h2>{request.event.name}</h2>
        <p className="vf-muted">{request.org.name}</p>
      </div>
      {notice ? (
        <Alert variant={notice.variant} data-testid="transfer-notice">
          {notice.message}
        </Alert>
      ) : null}
      <dl className="vf-details">
        <dt>From</dt>
        <dd>{request.sourceRegistration.portalAccount.name ?? request.sourceRegistration.portalAccount.email}</dd>
        <dt>Ticket</dt>
        <dd>{request.sourceRegistration.type.name}</dd>
        <dt>Invited account</dt>
        <dd>{request.recipientEmail}</dd>
        <dt>Expires</dt>
        <dd>{formatDate(request.expiresAt, { dateStyle: "medium", timeStyle: "short" })}</dd>
        <dt>Status</dt>
        <dd>{status}</dd>
      </dl>
      {/* Keep action owners mounted when the action refresh sees its terminal status,
          so their redirect effect can still load the decision notice. */}
      <div className={status === "PENDING" ? "vf-actions" : undefined} hidden={status !== "PENDING"}>
        <ActionStateForm action={acceptRegistrationTransfer}>
          <input type="hidden" name="requestId" value={request.id} />
          <input type="hidden" name="token" value={token} />
          <TransferAttendeeSelection attendees={attendees.filter((attendee) => !attendee.registered)} initialId={initialAttendee} />
          {status === "PENDING" ? <Button label="Accept transfer" type="submit" variant="primary" /> : null}
        </ActionStateForm>
        <ActionStateForm action={declineRegistrationTransfer}>
          <input type="hidden" name="requestId" value={request.id} />
          <input type="hidden" name="token" value={token} />
          {status === "PENDING" ? <Button label="Decline transfer" type="submit" variant="destructive" /> : null}
        </ActionStateForm>
      </div>
      {status !== "PENDING" ? <p className="vf-muted">This invitation can no longer be used.</p> : null}
    </section>
  );
}
