import { replayPlatformEmailDelivery } from "@/actions/email-delivery-actions";
import { ActionStateForm } from "@/components/action-state-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/i18n";
import { prisma, type EmailDeliveryStatus } from "@vfurst/db";

export const dynamic = "force-dynamic";

const statuses: EmailDeliveryStatus[] = ["QUEUED", "PROCESSING", "RETRYING", "DELIVERED", "DEAD_LETTERED"];

function formatStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

function statusVariant(status: EmailDeliveryStatus): BadgeProps["variant"] {
  if (status === "DELIVERED") return "success";
  if (status === "DEAD_LETTERED") return "error";
  if (status === "RETRYING") return "warning";
  return "info";
}

function maskEmail(recipient: string) {
  const [local, domain] = recipient.split("@");
  if (!local || !domain) return "Hidden recipient";
  return `${local.slice(0, 1)}***@${domain}`;
}

export default async function PlatformEmailOperationsPage() {
  const deliveryInclude = {
    org: { select: { name: true } },
    event: { select: { name: true } },
    attempts: {
      orderBy: { attemptNumber: "desc" as const },
      take: 1
    }
  };
  const [counts, deadLetteredDeliveries, latestDeliveries] = await Promise.all([
    prisma.emailDelivery.groupBy({
      by: ["status"],
      _count: { _all: true }
    }),
    prisma.emailDelivery.findMany({
      where: { status: "DEAD_LETTERED" },
      include: deliveryInclude,
      orderBy: { deadLetteredAt: "desc" },
      take: 100
    }),
    prisma.emailDelivery.findMany({
      include: deliveryInclude,
      orderBy: { createdAt: "desc" },
      take: 100
    })
  ]);
  const deliveries = [...deadLetteredDeliveries, ...latestDeliveries].filter(
    (delivery, index, candidates) => candidates.findIndex((candidate) => candidate.id === delivery.id) === index
  );

  return (
    <div className="vf-page">
      <PageHeader
        eyebrow="Platform operations"
        title="Email delivery"
        description="Monitor the durable email outbox, inspect sanitized failure details, and replay messages whose content is still safe to reuse."
      />

      <section className="vf-stat-grid" aria-label="Platform email delivery summary">
        {statuses.map((status) => (
          <div className="vf-stat-card" key={status}>
            <p className="vf-label">{formatStatus(status)}</p>
            <strong>{counts.find((item) => item.status === status)?._count._all ?? 0}</strong>
            <span>messages</span>
          </div>
        ))}
      </section>

      <section className="vf-section" aria-labelledby="recent-email-deliveries">
        <div>
          <h2 id="recent-email-deliveries">Recent deliveries</h2>
          <p className="vf-muted">Recipients are masked in the platform control plane. Payload content and token-bearing links are never displayed.</p>
        </div>
        <div className="vf-table">
          <div className="vf-table-head vf-five-col">
            <span>Scope</span><span>Message</span><span>Status</span><span>Latest attempt</span><span>Action</span>
          </div>
          {deliveries.map((delivery) => {
            const latestAttempt = delivery.attempts[0];
            const canReplay =
              delivery.status === "DEAD_LETTERED" &&
              delivery.replayable &&
              Boolean(delivery.payloadCiphertext && delivery.payloadIv && delivery.payloadAuthTag);

            return (
              <div className="vf-table-row vf-five-col" key={delivery.id}>
                <span>
                  <strong>{delivery.event?.name ?? delivery.org?.name ?? "Platform"}</strong>
                  <small>{delivery.org?.name ?? "Central service"}</small>
                </span>
                <span><strong>{delivery.template}</strong><small>{maskEmail(delivery.recipient)} · {formatDate(delivery.createdAt, { dateStyle: "medium", timeStyle: "short" })}</small></span>
                <span><Badge label={formatStatus(delivery.status)} variant={statusVariant(delivery.status)} /></span>
                <span>
                  {latestAttempt ? `#${latestAttempt.attemptNumber} ${formatStatus(latestAttempt.status)}` : "Not started"}
                  {delivery.lastErrorMessage ? <small>{delivery.lastErrorMessage}</small> : null}
                </span>
                <span>
                  {canReplay ? (
                    <ActionStateForm action={replayPlatformEmailDelivery} errorTestId="platform-email-replay-error">
                      <input type="hidden" name="deliveryId" value={delivery.id} />
                      <Button label="Replay" type="submit" size="sm" />
                    </ActionStateForm>
                  ) : delivery.status === "DEAD_LETTERED" && !delivery.replayable ? (
                    <small>Single-use content</small>
                  ) : (
                    <small>—</small>
                  )}
                </span>
              </div>
            );
          })}
          {deliveries.length === 0 ? <p className="vf-empty">No email deliveries have been recorded.</p> : null}
        </div>
      </section>
    </div>
  );
}
