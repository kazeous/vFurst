import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  classifyEmailDeliveryError,
  decryptEmailDeliveryPayload,
  encryptEmailDeliveryPayload,
  PermanentEmailDeliveryError,
  sanitizeEmailDeliveryError,
  type EmailDeliveryPayload
} from "./delivery.js";

const encryptionKey = randomBytes(32).toString("base64");
const payload: EmailDeliveryPayload = {
  to: "attendee@example.com",
  template: "registration-confirmation",
  data: { eventName: "FurCon", attendeeName: "Alex" }
};

describe("email delivery payload encryption", () => {
  it("round-trips a payload through an AES-256-GCM Prisma-compatible envelope", () => {
    const encrypted = encryptEmailDeliveryPayload(payload, encryptionKey);

    expect(encrypted).toEqual({
      payloadVersion: 1,
      payloadCiphertext: expect.any(Uint8Array),
      payloadIv: expect.any(Uint8Array),
      payloadAuthTag: expect.any(Uint8Array)
    });
    expect(Buffer.from(encrypted.payloadCiphertext).toString("utf8")).not.toContain(payload.to);
    expect(decryptEmailDeliveryPayload(encrypted, encryptionKey)).toEqual(payload);
  });

  it.each<EmailDeliveryPayload>([
    {
      to: "attendee@example.com",
      template: "portal-account-setup",
      data: { organizationName: "Fur & Fest", setupUrl: "https://furfest.test/set-password?token=setup-token" }
    },
    {
      to: "attendee@example.com",
      template: "portal-password-reset",
      data: { organizationName: "Fur & Fest", resetUrl: "https://furfest.test/set-password?token=reset-token" }
    },
    {
      to: "attendee@example.com",
      template: "portal-account-exists",
      data: {
        organizationName: "Fur & Fest",
        signInUrl: "https://furfest.test/login",
        resetUrl: "https://furfest.test/forgot-password"
      }
    }
  ])("round-trips a $template delivery with its account data", (portalPayload) => {
    const encrypted = encryptEmailDeliveryPayload(portalPayload, encryptionKey);

    expect(decryptEmailDeliveryPayload(encrypted, encryptionKey)).toEqual(portalPayload);
  });

  it("uses a fresh IV for every encrypted delivery", () => {
    const first = encryptEmailDeliveryPayload(payload, encryptionKey);
    const second = encryptEmailDeliveryPayload(payload, encryptionKey);

    expect(Buffer.from(first.payloadIv)).not.toEqual(Buffer.from(second.payloadIv));
    expect(Buffer.from(first.payloadCiphertext)).not.toEqual(Buffer.from(second.payloadCiphertext));
  });

  it.each(["", "not-base64", randomBytes(31).toString("base64"), `${randomBytes(32).toString("base64")}=`])(
    "rejects an invalid encryption key without exposing it: %s",
    (invalidKey) => {
      expect(() => encryptEmailDeliveryPayload(payload, invalidKey)).toThrowError(
        expect.objectContaining({ code: "INVALID_ENCRYPTION_KEY" })
      );
    }
  );

  it("rejects ciphertext, IV, authentication-tag, and version tampering", () => {
    const encrypted = encryptEmailDeliveryPayload(payload, encryptionKey);
    const tamperedCiphertext = Uint8Array.from(encrypted.payloadCiphertext);
    tamperedCiphertext[0] ^= 1;

    expect(() =>
      decryptEmailDeliveryPayload({ ...encrypted, payloadCiphertext: tamperedCiphertext }, encryptionKey)
    ).toThrowError(expect.objectContaining({ code: "INVALID_ENCRYPTED_PAYLOAD" }));
    expect(() =>
      decryptEmailDeliveryPayload({ ...encrypted, payloadAuthTag: new Uint8Array(15) }, encryptionKey)
    ).toThrowError(expect.objectContaining({ code: "INVALID_ENCRYPTED_PAYLOAD" }));
    expect(() =>
      decryptEmailDeliveryPayload({ ...encrypted, payloadIv: new Uint8Array(11) }, encryptionKey)
    ).toThrowError(expect.objectContaining({ code: "INVALID_ENCRYPTED_PAYLOAD" }));
    expect(() =>
      decryptEmailDeliveryPayload({ ...encrypted, payloadVersion: 2 } as never, encryptionKey)
    ).toThrowError(expect.objectContaining({ code: "INVALID_ENCRYPTED_PAYLOAD" }));
    expect(() => decryptEmailDeliveryPayload(encrypted, randomBytes(32).toString("base64"))).toThrowError(
      expect.objectContaining({ code: "INVALID_ENCRYPTED_PAYLOAD" })
    );
  });

  it("validates the decrypted payload contract", () => {
    expect(() =>
      encryptEmailDeliveryPayload({ ...payload, template: "unknown-template" } as never, encryptionKey)
    ).toThrowError(expect.objectContaining({ code: "INVALID_DELIVERY_PAYLOAD" }));
    expect(() => encryptEmailDeliveryPayload({ ...payload, data: [] } as never, encryptionKey)).toThrowError(
      expect.objectContaining({ code: "INVALID_DELIVERY_PAYLOAD" })
    );
  });
});

describe("email delivery errors", () => {
  it("classifies explicit and provider permanent failures", () => {
    expect(classifyEmailDeliveryError(new PermanentEmailDeliveryError("BAD_CONTEXT", "Bad context"))).toBe(
      "PERMANENT"
    );
    expect(classifyEmailDeliveryError({ code: "EAUTH" })).toBe("PERMANENT");
    expect(classifyEmailDeliveryError({ responseCode: 550 })).toBe("PERMANENT");
    expect(classifyEmailDeliveryError({ $metadata: { httpStatusCode: 403 } })).toBe("PERMANENT");
  });

  it("keeps transient and unknown failures retryable", () => {
    expect(classifyEmailDeliveryError({ code: "ETIMEDOUT" })).toBe("RETRYABLE");
    expect(classifyEmailDeliveryError({ responseCode: 421 })).toBe("RETRYABLE");
    expect(classifyEmailDeliveryError({ $metadata: { httpStatusCode: 429 } })).toBe("RETRYABLE");
    expect(classifyEmailDeliveryError(new Error("Unknown provider failure"))).toBe("RETRYABLE");
  });

  it("redacts secrets, credentials, recipient PII, control characters, and bounds stored errors", () => {
    const sanitized = sanitizeEmailDeliveryError(
      new Error(
        `SMTP smtp://mailer:super-secret@mail.example failed for attendee@example.com\nAuthorization: Bearer token-value ${"x".repeat(600)}`
      )
    );

    expect(sanitized).not.toContain("super-secret");
    expect(sanitized).not.toContain("attendee@example.com");
    expect(sanitized).not.toContain("token-value");
    expect(sanitized).not.toContain("\n");
    expect(sanitized.length).toBeLessThanOrEqual(500);
    expect(sanitizeEmailDeliveryError({ private: true })).toBe("Email delivery failed.");
  });
});
