import { saveEmailTemplate } from "@/actions/phase5-actions";
import { requireEventPageAccess } from "@/lib/dashboard-access";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";
import { allowedEventEmailTokens, renderCustomEmailTemplate, type EventEmailTemplateKey } from "@vfurst/email";
import { replayEventEmailDelivery } from "@/actions/email-delivery-actions";
import { ActionStateForm } from "@/components/action-state-form";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { EmailDeliveryStatus } from "@vfurst/db";

export const dynamic = "force-dynamic";

const templateOptions = [
  { key: "registration-confirmation", label: "Registration confirmation" },
  { key: "payment-receipt", label: "Payment receipt" },
  { key: "volunteer-approval", label: "Volunteer decision" },
  { key: "vendor-status", label: "Vendor status" },
  { key: "transfer-request", label: "Transfer request" }
] as const;

const defaultTemplates = {
  "registration-confirmation": {
    subject: "You're registered for {{event.name}}",
    html: "<p>Hello {{attendee.name}}, your registration for {{event.name}} is confirmed.</p>",
    text: "Hello {{attendee.name}}, your registration for {{event.name}} is confirmed."
  },
  "payment-receipt": {
    subject: "Receipt for {{event.name}}",
    html: "<p>We received your payment of {{order.total}} {{order.currency}} for {{event.name}}.</p>",
    text: "We received your payment of {{order.total}} {{order.currency}} for {{event.name}}."
  },
  "volunteer-approval": {
    subject: "Volunteer application {{volunteer.status}}",
    html: "<p>{{attendee.name}}, your volunteer application for {{event.name}} is {{volunteer.status}}.</p><p>{{volunteer.reason}}</p>",
    text: "{{attendee.name}}, your volunteer application for {{event.name}} is {{volunteer.status}}.\n\n{{volunteer.reason}}"
  },
  "vendor-status": {
    subject: "Vendor application update",
    html: "<p>{{vendor.business}}'s vendor application for {{event.name}} is {{vendor.status}}.</p><p>{{vendor.note}}</p>",
    text: "{{vendor.business}}'s vendor application for {{event.name}} is {{vendor.status}}.\n\n{{vendor.note}}"
  },
  "transfer-request": {
    subject: "Registration transfer request",
    html: "<p>{{transfer.source}} wants to transfer a {{event.name}} registration to you.</p><p><a href=\"{{transfer.url}}\">Review transfer request</a></p><p>This link expires {{transfer.expiresAt}}.</p>",
    text: "{{transfer.source}} wants to transfer a {{event.name}} registration to you.\n\n{{transfer.url}}\n\nThis link expires {{transfer.expiresAt}}."
  }
};

type TemplateKey = keyof typeof defaultTemplates;
type TemplateConfig = (typeof defaultTemplates)[TemplateKey];

function emailTemplates(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const settings = value as { emailTemplates?: unknown };
  return settings.emailTemplates && typeof settings.emailTemplates === "object" && !Array.isArray(settings.emailTemplates)
    ? (settings.emailTemplates as Partial<Record<TemplateKey, TemplateConfig>>)
    : ({} as Partial<Record<TemplateKey, TemplateConfig>>);
}

function renderPreview(key: EventEmailTemplateKey, template: TemplateConfig, eventName: string) {
  try {
    return renderCustomEmailTemplate(key, template, {
      attendeeName: "Sam Rivera",
      eventName,
      orderTotal: "$75.00",
      orderCurrency: "USD",
      status: "approved",
      reason: "Thanks for applying.",
      businessName: "Rivera Goods",
      note: "Your next steps are listed in the portal.",
      sourceName: "Alex Morgan",
      transferUrl: "https://example.test/transfer/demo",
      expiresAt: "tomorrow"
    }).text;
  } catch {
    return "This template contains invalid variables and will use the built-in fallback when delivered.";
  }
}

const deliveryStatuses: EmailDeliveryStatus[] = ["QUEUED", "PROCESSING", "RETRYING", "DELIVERED", "DEAD_LETTERED"];

function statusVariant(status: EmailDeliveryStatus): BadgeProps["variant"] {
  if (status === "DELIVERED") return "success";
  if (status === "DEAD_LETTERED") return "error";
  if (status === "RETRYING") return "warning";
  return "info";
}

function formatStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

export default async function EmailSettingsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  await requireEventPageAccess(eventId);
  const [event, deliveryCounts, deadLetteredDeliveries, latestDeliveries] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId } }),
    prisma.emailDelivery.groupBy({
      by: ["status"],
      where: { eventId },
      _count: { _all: true }
    }),
    prisma.emailDelivery.findMany({
      where: { eventId, status: "DEAD_LETTERED" },
      include: {
        attempts: {
          orderBy: { attemptNumber: "desc" },
          take: 1
        }
      },
      orderBy: { deadLetteredAt: "desc" },
      take: 25
    }),
    prisma.emailDelivery.findMany({
      where: { eventId },
      include: {
        attempts: {
          orderBy: { attemptNumber: "desc" },
          take: 1
        }
      },
      orderBy: { createdAt: "desc" },
      take: 25
    })
  ]);

  if (!event) {
    notFound();
  }

  const templates = emailTemplates(event.settings);
  const recentDeliveries = [...deadLetteredDeliveries, ...latestDeliveries].filter(
    (delivery, index, deliveries) => deliveries.findIndex((candidate) => candidate.id === delivery.id) === index
  );

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Settings</p>
          <h1>Email templates</h1>
          <p className="vf-muted">Customize HTML and plain-text event messages with variable placeholders.</p>
        </div>
      </header>

      <section className="vf-section">
        <h2>Available variables</h2>
        <div className="vf-token-row">
          {[...new Set(templateOptions.flatMap((option) => allowedEventEmailTokens(option.key as EventEmailTemplateKey)))].map((token) => (
            <code key={token}>{`{{${token}}}`}</code>
          ))}
        </div>
      </section>

      <section className="vf-section" aria-labelledby="email-delivery-operations">
        <div>
          <h2 id="email-delivery-operations">Delivery operations</h2>
          <p className="vf-muted">Inspect durable queue status and retry replay-safe messages. Single-use reset, invitation, and transfer links cannot be replayed.</p>
        </div>
        <div className="vf-stat-grid" aria-label="Email delivery status summary">
          {deliveryStatuses.map((status) => (
            <div className="vf-stat-card" key={status}>
              <p className="vf-label">{formatStatus(status)}</p>
              <strong>{deliveryCounts.find((item) => item.status === status)?._count._all ?? 0}</strong>
              <span>messages</span>
            </div>
          ))}
        </div>
        <div className="vf-table">
          <div className="vf-table-head vf-five-col">
            <span>Message</span><span>Recipient</span><span>Status</span><span>Latest attempt</span><span>Action</span>
          </div>
          {recentDeliveries.map((delivery) => {
            const latestAttempt = delivery.attempts[0];
            const canReplay =
              delivery.status === "DEAD_LETTERED" &&
              delivery.replayable &&
              Boolean(delivery.payloadCiphertext && delivery.payloadIv && delivery.payloadAuthTag);

            return (
              <div className="vf-table-row vf-five-col" key={delivery.id}>
                <span><strong>{delivery.template}</strong><small>{delivery.createdAt.toLocaleString()}</small></span>
                <span>{delivery.recipient}</span>
                <span><Badge label={formatStatus(delivery.status)} variant={statusVariant(delivery.status)} /></span>
                <span>
                  {latestAttempt ? `#${latestAttempt.attemptNumber} ${formatStatus(latestAttempt.status)}` : "Not started"}
                  {delivery.lastErrorMessage ? <small>{delivery.lastErrorMessage}</small> : null}
                </span>
                <span>
                  {canReplay ? (
                    <ActionStateForm action={replayEventEmailDelivery} errorTestId="event-email-replay-error">
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
          {recentDeliveries.length === 0 ? <p className="vf-empty">No email deliveries have been queued for this event.</p> : null}
        </div>
      </section>

      <section className="vf-email-template-grid">
        {templateOptions.map((option) => {
          const template = templates[option.key] ?? defaultTemplates[option.key];
          const key = option.key as EventEmailTemplateKey;

          return (
            <article key={option.key} className="vf-section">
              <h2>{option.label}</h2>
              <form action={saveEmailTemplate} className="vf-form">
                <input type="hidden" name="eventId" value={event.id} />
                <input type="hidden" name="templateKey" value={option.key} />
                <label>
                  Subject
                  <input name="subject" defaultValue={template.subject} required />
                </label>
                <label>
                  HTML
                  <textarea name="html" rows={5} defaultValue={template.html} required />
                </label>
                <label>
                  Plain text
                  <textarea name="text" rows={4} defaultValue={template.text} required />
                </label>
                <Button label="Save template" type="submit" variant="primary" />
              </form>
              <div className="vf-preview">
                <strong>Preview</strong>
                <p>{renderPreview(key, template, event.name)}</p>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
