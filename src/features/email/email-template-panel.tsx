"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EMAIL_TEMPLATE_KEYS, type EmailTemplateKey } from "@/shared/email";

type EmailTemplate = {
  id: string | null;
  key: EmailTemplateKey;
  name: string;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  enabled: boolean;
  nonCritical: boolean;
  source: string;
};

type EmailLog = {
  id: string;
  toEmail: string;
  subject: string;
  status: string;
  error: string | null;
  createdAt: string;
  template: {
    key: string;
    name: string;
  } | null;
};

type EmailTemplatePanelProps = {
  endpointBase: string;
  initialKey?: EmailTemplateKey;
  title: string;
};

type Preview = {
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
};

const LABELS: Record<EmailTemplateKey, string> = {
  ORGANIZATION_INVITE: "Organization invite",
  EVENT_INVITE: "Event invite",
  REGISTRATION_CONFIRMATION: "Registration confirmation",
  VENDOR_APPLICATION_RECEIVED: "Vendor application received",
  VOLUNTEER_APPLICATION_RECEIVED: "Volunteer application received",
  ORDER_RECEIPT: "Order receipt"
};

export function EmailTemplatePanel({ endpointBase, initialKey = "ORGANIZATION_INVITE", title }: EmailTemplatePanelProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [selectedKey, setSelectedKey] = useState<EmailTemplateKey>(initialKey);
  const [form, setForm] = useState({
    name: "",
    subject: "",
    bodyText: "",
    bodyHtml: "",
    enabled: true,
    nonCritical: true
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.key === selectedKey) ?? null,
    [selectedKey, templates]
  );

  const loadEmailState = useCallback(async () => {
    setError(null);
    const [templatesResponse, logsResponse] = await Promise.all([
      fetch(`${endpointBase}/email-templates`),
      fetch(`${endpointBase}/email-logs?pageSize=8`)
    ]);
    const templatesBody = (await templatesResponse.json().catch(() => null)) as { templates?: EmailTemplate[]; error?: string } | null;
    const logsBody = (await logsResponse.json().catch(() => null)) as { items?: EmailLog[] } | null;

    if (!templatesResponse.ok || !templatesBody?.templates) {
      setError(templatesBody?.error ?? "Unable to load email templates.");
      return;
    }

    setTemplates(templatesBody.templates);
    setLogs(logsBody?.items ?? []);
  }, [endpointBase]);

  useEffect(() => {
    void loadEmailState();
  }, [loadEmailState]);

  useEffect(() => {
    if (!selectedTemplate) {
      return;
    }

    setForm({
      name: selectedTemplate.name,
      subject: selectedTemplate.subject,
      bodyText: selectedTemplate.bodyText,
      bodyHtml: selectedTemplate.bodyHtml ?? "",
      enabled: selectedTemplate.enabled,
      nonCritical: selectedTemplate.nonCritical
    });
    setPreview(null);
  }, [selectedTemplate]);

  async function submitTemplate(action: "save" | "preview") {
    setMessage(null);
    setError(null);
    const response = await fetch(`${endpointBase}/email-templates${action === "preview" ? "/preview" : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: selectedKey,
        name: form.name,
        subject: form.subject,
        bodyText: form.bodyText,
        bodyHtml: form.bodyHtml || undefined,
        enabled: form.enabled,
        nonCritical: form.nonCritical
      })
    });
    const body = (await response.json().catch(() => null)) as { preview?: Preview; error?: string } | null;

    if (!response.ok) {
      setError(body?.error ?? "Email template request failed.");
      return;
    }

    if (action === "preview") {
      setPreview(body?.preview ?? null);
      return;
    }

    setMessage("Email template saved.");
    await loadEmailState();
  }

  return (
    <section className="rounded-md border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-normal">{title}</h2>
          <p className="text-sm text-muted-foreground">
            Current source: {selectedTemplate?.source ?? "default"}
          </p>
        </div>
        <select
          className="rounded-md border px-3 py-2 text-sm"
          onChange={(event) => setSelectedKey(event.currentTarget.value as EmailTemplateKey)}
          value={selectedKey}
        >
          {EMAIL_TEMPLATE_KEYS.map((key) => (
            <option key={key} value={key}>
              {LABELS[key]}
            </option>
          ))}
        </select>
      </div>
      {message ? <p className="mt-3 rounded-md border bg-secondary p-3 text-sm">{message}</p> : null}
      {error ? <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p> : null}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitTemplate("save");
          }}
        >
          <input
            className="rounded-md border px-3 py-2"
            onChange={(event) => setForm((current) => ({ ...current, name: event.currentTarget.value }))}
            placeholder="Template name"
            required
            value={form.name}
          />
          <input
            className="rounded-md border px-3 py-2"
            onChange={(event) => setForm((current) => ({ ...current, subject: event.currentTarget.value }))}
            placeholder="Subject"
            required
            value={form.subject}
          />
          <textarea
            className="min-h-40 rounded-md border px-3 py-2"
            onChange={(event) => setForm((current) => ({ ...current, bodyText: event.currentTarget.value }))}
            placeholder="Plain text body"
            required
            value={form.bodyText}
          />
          <textarea
            className="min-h-28 rounded-md border px-3 py-2"
            onChange={(event) => setForm((current) => ({ ...current, bodyHtml: event.currentTarget.value }))}
            placeholder="Optional HTML body"
            value={form.bodyHtml}
          />
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                checked={form.enabled}
                onChange={(event) => setForm((current) => ({ ...current, enabled: event.currentTarget.checked }))}
                type="checkbox"
              />
              Enabled
            </label>
            <label className="flex items-center gap-2">
              <input
                checked={form.nonCritical}
                onChange={(event) => setForm((current) => ({ ...current, nonCritical: event.currentTarget.checked }))}
                type="checkbox"
              />
              Non-critical
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">Save template</button>
            <button className="rounded-md border px-4 py-2 font-medium" onClick={() => void submitTemplate("preview")} type="button">
              Preview
            </button>
          </div>
        </form>
        <div className="space-y-4">
          <div className="rounded-md border p-3 text-sm">
            <h3 className="font-medium">Preview</h3>
            {preview ? (
              <div className="mt-3 space-y-2">
                <p className="font-medium">{preview.subject}</p>
                <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-md bg-secondary p-3 text-xs">{preview.bodyText}</pre>
              </div>
            ) : (
              <p className="mt-3 text-muted-foreground">No preview generated.</p>
            )}
          </div>
          <div className="rounded-md border p-3 text-sm">
            <h3 className="font-medium">Recent email activity</h3>
            <div className="mt-3 space-y-3">
              {logs.length === 0 ? <p className="text-muted-foreground">No email activity yet.</p> : null}
              {logs.map((log) => (
                <div className="border-b pb-2 last:border-b-0" key={log.id}>
                  <p className="font-medium">{log.status}</p>
                  <p className="break-all text-muted-foreground">{log.toEmail}</p>
                  <p className="text-muted-foreground">{log.template?.name ?? log.subject}</p>
                  {log.error ? <p className="text-muted-foreground">{log.error}</p> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
