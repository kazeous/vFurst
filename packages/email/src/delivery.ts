import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { EmailTemplateName } from "./types.js";

const EMAIL_DELIVERY_PAYLOAD_VERSION = 1 as const;
const AES_256_GCM_ALGORITHM = "aes-256-gcm";
const AES_256_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_AUTH_TAG_BYTES = 16;
const MAX_STORED_ERROR_LENGTH = 500;

const emailTemplateNames = new Set<EmailTemplateName>([
  "registration-confirmation",
  "payment-receipt",
  "hotel-booking-confirmation",
  "volunteer-application-decision",
  "volunteer-shift-assignment",
  "vendor-application-decision",
  "staff-message",
  "registration-transfer",
  "organization-invitation",
  "portal-account-setup",
  "portal-password-reset",
  "portal-account-exists",
  "password-reset"
]);

export type EmailDeliveryPayload = {
  to: string;
  template: EmailTemplateName;
  data: Record<string, unknown>;
};

/**
 * The encrypted envelope maps directly to the Prisma Bytes columns used by an
 * email-delivery record. The version is authenticated along with the payload,
 * which prevents an envelope from being relabelled as a different format.
 */
export type EncryptedEmailDeliveryPayload = {
  payloadVersion: number;
  payloadCiphertext: Uint8Array;
  payloadIv: Uint8Array;
  payloadAuthTag: Uint8Array;
};

export type EmailDeliveryErrorClassification = "PERMANENT" | "RETRYABLE";

export class PermanentEmailDeliveryError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PermanentEmailDeliveryError";
    this.code = code;
  }
}

function invalidEncryptionKey(): PermanentEmailDeliveryError {
  return new PermanentEmailDeliveryError(
    "INVALID_ENCRYPTION_KEY",
    "Email delivery encryption key must be a base64-encoded 32-byte key."
  );
}

function decodeEncryptionKey(encodedKey: string): Buffer {
  if (typeof encodedKey !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(encodedKey)) {
    throw invalidEncryptionKey();
  }

  const key = Buffer.from(encodedKey, "base64");
  if (key.byteLength !== AES_256_KEY_BYTES || key.toString("base64") !== encodedKey) {
    throw invalidEncryptionKey();
  }

  return key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateDeliveryPayload(value: unknown): EmailDeliveryPayload {
  if (!isRecord(value)) {
    throw new PermanentEmailDeliveryError("INVALID_DELIVERY_PAYLOAD", "Email delivery payload must be an object.");
  }

  const { to, template, data } = value;
  if (typeof to !== "string" || to.trim().length === 0) {
    throw new PermanentEmailDeliveryError(
      "INVALID_DELIVERY_PAYLOAD",
      "Email delivery payload requires a recipient."
    );
  }

  if (typeof template !== "string" || !emailTemplateNames.has(template as EmailTemplateName)) {
    throw new PermanentEmailDeliveryError(
      "INVALID_DELIVERY_PAYLOAD",
      "Email delivery payload contains an unsupported template."
    );
  }

  if (!isRecord(data)) {
    throw new PermanentEmailDeliveryError(
      "INVALID_DELIVERY_PAYLOAD",
      "Email delivery payload data must be an object."
    );
  }

  return { to, template: template as EmailTemplateName, data };
}

function payloadVersionAad(version: number): Buffer {
  return Buffer.from(`vfurst:email-delivery:v${version}`, "utf8");
}

export function encryptEmailDeliveryPayload(
  payload: EmailDeliveryPayload,
  encodedKey: string
): EncryptedEmailDeliveryPayload {
  const validPayload = validateDeliveryPayload(payload);
  const key = decodeEncryptionKey(encodedKey);
  const payloadIv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv(AES_256_GCM_ALGORITHM, key, payloadIv, {
    authTagLength: GCM_AUTH_TAG_BYTES
  });
  cipher.setAAD(payloadVersionAad(EMAIL_DELIVERY_PAYLOAD_VERSION));

  let serialized: string;
  try {
    serialized = JSON.stringify(validPayload);
  } catch (error) {
    throw new PermanentEmailDeliveryError(
      "INVALID_DELIVERY_PAYLOAD",
      "Email delivery payload must be JSON serializable.",
      { cause: error }
    );
  }

  const payloadCiphertext = Buffer.concat([cipher.update(serialized, "utf8"), cipher.final()]);

  return {
    payloadVersion: EMAIL_DELIVERY_PAYLOAD_VERSION,
    payloadCiphertext,
    payloadIv,
    payloadAuthTag: cipher.getAuthTag()
  };
}

function validateEncryptedEnvelope(envelope: EncryptedEmailDeliveryPayload): void {
  if (
    !envelope ||
    envelope.payloadVersion !== EMAIL_DELIVERY_PAYLOAD_VERSION ||
    !(envelope.payloadCiphertext instanceof Uint8Array) ||
    envelope.payloadCiphertext.byteLength === 0 ||
    !(envelope.payloadIv instanceof Uint8Array) ||
    envelope.payloadIv.byteLength !== GCM_IV_BYTES ||
    !(envelope.payloadAuthTag instanceof Uint8Array) ||
    envelope.payloadAuthTag.byteLength !== GCM_AUTH_TAG_BYTES
  ) {
    throw new PermanentEmailDeliveryError(
      "INVALID_ENCRYPTED_PAYLOAD",
      "Encrypted email delivery payload has an invalid envelope."
    );
  }
}

export function decryptEmailDeliveryPayload(
  envelope: EncryptedEmailDeliveryPayload,
  encodedKey: string
): EmailDeliveryPayload {
  validateEncryptedEnvelope(envelope);
  const key = decodeEncryptionKey(encodedKey);

  let plaintext: string;
  try {
    const decipher = createDecipheriv(AES_256_GCM_ALGORITHM, key, Buffer.from(envelope.payloadIv), {
      authTagLength: GCM_AUTH_TAG_BYTES
    });
    decipher.setAAD(payloadVersionAad(envelope.payloadVersion));
    decipher.setAuthTag(Buffer.from(envelope.payloadAuthTag));
    plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.payloadCiphertext)),
      decipher.final()
    ]).toString("utf8");
  } catch (error) {
    throw new PermanentEmailDeliveryError(
      "INVALID_ENCRYPTED_PAYLOAD",
      "Encrypted email delivery payload could not be authenticated.",
      { cause: error }
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch (error) {
    throw new PermanentEmailDeliveryError(
      "INVALID_ENCRYPTED_PAYLOAD",
      "Decrypted email delivery payload is not valid JSON.",
      { cause: error }
    );
  }

  return validateDeliveryPayload(parsed);
}

function errorProperty(error: unknown, property: string): unknown {
  return isRecord(error) ? error[property] : undefined;
}

const retryableCodes = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENETDOWN",
  "ENETUNREACH",
  "EPIPE",
  "ESOCKET",
  "RequestTimeout",
  "RequestTimeoutException",
  "Throttling",
  "ThrottlingException",
  "TooManyRequestsException"
]);

const permanentCodes = new Set([
  "EAUTH",
  "EENVELOPE",
  "EMESSAGE",
  "INVALID_DELIVERY_PAYLOAD",
  "INVALID_ENCRYPTED_PAYLOAD",
  "INVALID_ENCRYPTION_KEY",
  "MessageRejected",
  "MailFromDomainNotVerifiedException"
]);

/**
 * Unknown errors remain retryable so transient provider failures are not
 * discarded. Known input/auth/config failures can be dead-lettered directly.
 */
export function classifyEmailDeliveryError(error: unknown): EmailDeliveryErrorClassification {
  if (error instanceof PermanentEmailDeliveryError) {
    return "PERMANENT";
  }

  const code = errorProperty(error, "code");
  const name = errorProperty(error, "name");
  if (
    (typeof code === "string" && permanentCodes.has(code)) ||
    (typeof name === "string" && permanentCodes.has(name))
  ) {
    return "PERMANENT";
  }
  if (
    (typeof code === "string" && retryableCodes.has(code)) ||
    (typeof name === "string" && retryableCodes.has(name))
  ) {
    return "RETRYABLE";
  }

  const responseCode = errorProperty(error, "responseCode");
  if (typeof responseCode === "number") {
    if (responseCode >= 500 && responseCode <= 599) {
      return "PERMANENT";
    }
    if (responseCode >= 400 && responseCode <= 499) {
      return "RETRYABLE";
    }
  }

  const metadata = errorProperty(error, "$metadata");
  const httpStatusCode = errorProperty(metadata, "httpStatusCode");
  if (typeof httpStatusCode === "number") {
    if (httpStatusCode === 408 || httpStatusCode === 429 || httpStatusCode >= 500) {
      return "RETRYABLE";
    }
    if (httpStatusCode >= 400) {
      return "PERMANENT";
    }
  }

  return "RETRYABLE";
}

/** Returns a single-line, bounded message safe for persisted operator logs. */
export function sanitizeEmailDeliveryError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "Email delivery failed.";
  const sanitized = raw
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(password|passwd|pass|secret|token|api[_-]?key|authorization)\b\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return (sanitized || "Email delivery failed.").slice(0, MAX_STORED_ERROR_LENGTH);
}
