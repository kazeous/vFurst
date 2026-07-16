import { z } from "zod";
import type { EmailTemplateName } from "./types.js";

export const eventEmailTemplateKeys = [
  "registration-confirmation",
  "payment-receipt",
  "volunteer-approval",
  "vendor-status",
  "transfer-request"
] as const;

export type EventEmailTemplateKey = (typeof eventEmailTemplateKeys)[number];

export type EventEmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

export type EventEmailTemplateOverride = {
  key: EventEmailTemplateKey;
  template: EventEmailTemplate;
};

const templateSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  html: z.string().trim().min(1).max(100_000),
  text: z.string().trim().min(1).max(100_000)
});

const allowedTokens: Record<EventEmailTemplateKey, readonly string[]> = {
  "registration-confirmation": ["attendee.name", "event.name"],
  "payment-receipt": ["attendee.name", "event.name", "order.total", "order.currency"],
  "volunteer-approval": ["attendee.name", "event.name", "volunteer.status", "volunteer.reason"],
  "vendor-status": ["event.name", "vendor.business", "vendor.status", "vendor.note"],
  "transfer-request": ["attendee.name", "event.name", "transfer.source", "transfer.url", "transfer.expiresAt"]
};

const templateKeyByName: Partial<Record<EmailTemplateName, EventEmailTemplateKey>> = {
  "registration-confirmation": "registration-confirmation",
  "payment-receipt": "payment-receipt",
  "volunteer-application-decision": "volunteer-approval",
  "vendor-application-decision": "vendor-status",
  "registration-transfer": "transfer-request"
};

const tokenPattern = /{{\s*([a-zA-Z0-9_.]+)\s*}}/g;

function templateTokens(value: string) {
  return [...value.matchAll(tokenPattern)].map((match) => match[1]).filter((token): token is string => Boolean(token));
}

function assertAllowedTokens(key: EventEmailTemplateKey, template: EventEmailTemplate) {
  const allowed = new Set(allowedTokens[key]);
  for (const field of [template.subject, template.html, template.text]) {
    for (const token of templateTokens(field)) {
      if (!allowed.has(token)) {
        throw new Error(`Template variable {{${token}}} is not allowed for ${key}.`);
      }
    }
  }
}

export function parseEventEmailTemplate(key: EventEmailTemplateKey, value: unknown): EventEmailTemplate {
  const template = templateSchema.parse(value);
  assertAllowedTokens(key, template);
  return template;
}

export function eventEmailTemplateKeyForName(template: EmailTemplateName) {
  return templateKeyByName[template];
}

function settingsObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function getEventEmailTemplate(value: unknown, template: EmailTemplateName): EventEmailTemplateOverride | null {
  const key = eventEmailTemplateKeyForName(template);
  if (!key) return null;

  const rawTemplates = settingsObject(settingsObject(value).emailTemplates);
  const rawTemplate = rawTemplates[key];
  if (rawTemplate == null) return null;

  try {
    return {
      key,
      template: parseEventEmailTemplate(key, rawTemplate)
    };
  } catch {
    // Invalid legacy or manually edited settings fail closed to the built-in template.
    return null;
  }
}

function valueFrom(data: Record<string, unknown>, token: string) {
  const direct = data[token];
  if (direct !== undefined && direct !== null) return String(direct);

  const nested = token.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[part];
  }, data);
  if (nested !== undefined && nested !== null) return String(nested);

  const aliases: Record<string, string[]> = {
    "attendee.name": ["attendeeName", "applicantName", "recipientName", "name"],
    "event.name": ["eventName"],
    "order.total": ["orderTotal", "total"],
    "order.currency": ["orderCurrency", "currency"],
    "volunteer.status": ["status"],
    "volunteer.reason": ["reason"],
    "vendor.business": ["businessName"],
    "vendor.status": ["status"],
    "vendor.note": ["note"],
    "transfer.source": ["sourceName"],
    "transfer.url": ["transferUrl"],
    "transfer.expiresAt": ["expiresAt"]
  };

  for (const alias of aliases[token] ?? []) {
    const value = data[alias];
    if (value !== undefined && value !== null) return String(value);
  }

  return "";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeVariableValue(token: string, value: string) {
  if (token.endsWith(".url")) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
    } catch {
      return "";
    }
  }

  return value;
}

function sanitizeSubject(value: string) {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? " " : character;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function renderField(source: string, data: Record<string, unknown>, mode: "html" | "text" | "subject") {
  return source.replace(tokenPattern, (_match, token: string) => {
    const value = safeVariableValue(token, valueFrom(data, token));
    if (mode === "html") return escapeHtml(value);
    if (mode === "subject") return sanitizeSubject(value);
    return value;
  });
}

export function renderCustomEmailTemplate(
  key: EventEmailTemplateKey,
  template: EventEmailTemplate,
  data: Record<string, unknown>
) {
  const validated = parseEventEmailTemplate(key, template);
  return {
    subject: sanitizeSubject(renderField(validated.subject, data, "subject")),
    html: renderField(validated.html, data, "html"),
    text: renderField(validated.text, data, "text")
  };
}

export function allowedEventEmailTokens(key: EventEmailTemplateKey) {
  return [...allowedTokens[key]];
}
