import { saveEmailTemplate } from "@/actions/phase5-actions";
import { requireEventPageAccess } from "@/lib/dashboard-access";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";
import { allowedEventEmailTokens, renderCustomEmailTemplate, type EventEmailTemplateKey } from "@vfurst/email";

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

export default async function EmailSettingsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  await requireEventPageAccess(eventId);
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    }
  });

  if (!event) {
    notFound();
  }

  const templates = emailTemplates(event.settings);

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
