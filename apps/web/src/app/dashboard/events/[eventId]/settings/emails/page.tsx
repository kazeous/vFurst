import { saveEmailTemplate } from "@/actions/phase5-actions";
import { requireEventAccess } from "@/lib/dashboard-access";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const templateOptions = [
  { key: "registration-confirmation", label: "Registration confirmation" },
  { key: "payment-receipt", label: "Payment receipt" },
  { key: "volunteer-approval", label: "Volunteer approval" },
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
    html: "<p>We received your payment of {{order.total}} for {{event.name}}.</p>",
    text: "We received your payment of {{order.total}} for {{event.name}}."
  },
  "volunteer-approval": {
    subject: "Volunteer application approved",
    html: "<p>{{attendee.name}}, you were approved to volunteer at {{event.name}}.</p>",
    text: "{{attendee.name}}, you were approved to volunteer at {{event.name}}."
  },
  "vendor-status": {
    subject: "Vendor application update",
    html: "<p>Your vendor application for {{event.name}} is {{vendor.status}}.</p>",
    text: "Your vendor application for {{event.name}} is {{vendor.status}}."
  },
  "transfer-request": {
    subject: "Registration transfer request",
    html: "<p>{{attendee.name}} wants to transfer a {{event.name}} registration to you.</p>",
    text: "{{attendee.name}} wants to transfer a {{event.name}} registration to you."
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

function renderPreview(template: string, eventName: string) {
  return template
    .replaceAll("{{attendee.name}}", "Sam Rivera")
    .replaceAll("{{event.name}}", eventName)
    .replaceAll("{{order.total}}", "$75.00")
    .replaceAll("{{vendor.status}}", "approved");
}

export default async function EmailSettingsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  await requireEventAccess(eventId);
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
          {["{{attendee.name}}", "{{event.name}}", "{{order.total}}", "{{vendor.status}}"].map((token) => (
            <code key={token}>{token}</code>
          ))}
        </div>
      </section>

      <section className="vf-email-template-grid">
        {templateOptions.map((option) => {
          const template = templates[option.key] ?? defaultTemplates[option.key];

          return (
            <article key={option.key} className="vf-section">
              <h2>{option.label}</h2>
              <form action={saveEmailTemplate} className="vf-form">
                <input type="hidden" name="orgId" value={event.orgId} />
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
                <p>{renderPreview(template.text, event.name)}</p>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
