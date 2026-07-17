import { describe, expect, it } from "vitest";
import {
  authorizationCodeClaimsSchema,
  authorizationStartSchema,
  controlPlaneEventSchema,
  provisionTenantCommandSchema,
  webhookEventEnvelopeSchema
} from "./index.js";

const ids = {
  actor: "11111111-1111-4111-8111-111111111111",
  correlation: "22222222-2222-4222-8222-222222222222",
  event: "33333333-3333-4333-8333-333333333333",
  org: "44444444-4444-4444-8444-444444444444",
  user: "55555555-5555-4555-8555-555555555555"
};

describe("shared contracts", () => {
  it("accepts a bounded tenant-web authorization request", () => {
    expect(
      authorizationStartSchema.parse({
        audience: "tenant-web",
        redirectUri: "https://console.vfurst.example/auth/callback",
        state: "s".repeat(43),
        codeChallenge: "c".repeat(43)
      })
    ).toMatchObject({ audience: "tenant-web" });
  });

  it("rejects non-HTTPS remote callback URLs", () => {
    expect(() =>
      authorizationStartSchema.parse({
        audience: "tenant-web",
        redirectUri: "http://attacker.example/callback",
        state: "s".repeat(43),
        codeChallenge: "c".repeat(43)
      })
    ).toThrow();
  });

  it("retains authVersion in authorization-code claims", () => {
    const claims = authorizationCodeClaimsSchema.parse({
      issuer: "platform-manager",
      audience: "tenant-web",
      codeId: ids.event,
      userId: ids.user,
      authVersion: 7,
      redirectUri: "http://localhost:3001/auth/callback",
      codeChallenge: "c".repeat(43),
      issuedAt: 100,
      expiresAt: 160
    });

    expect(claims.authVersion).toBe(7);
  });

  it("validates durable control-plane lifecycle events", () => {
    const event = controlPlaneEventSchema.parse({
      id: ids.event,
      type: "tenant.lifecycle-changed",
      organizationId: ids.org,
      occurredAt: "2026-07-17T00:00:00.000Z",
      actorUserId: ids.actor,
      aggregateVersion: 2,
      correlationId: ids.correlation,
      data: { previousStatus: "PROVISIONING", status: "ACTIVE" }
    });

    expect(event.type).toBe("tenant.lifecycle-changed");
  });

  it("models payment policy as a platform aggregate without a fake organization", () => {
    const event = controlPlaneEventSchema.parse({
      id: ids.event,
      type: "platform.payment-policy-changed",
      occurredAt: "2026-07-17T00:00:00.000Z",
      actorUserId: ids.actor,
      aggregateVersion: 3,
      correlationId: ids.correlation,
      data: {
        providers: [
          { provider: "STRIPE", enabled: true },
          { provider: "SEPAY", enabled: false }
        ],
        policyVersion: 3
      }
    });

    expect(event).not.toHaveProperty("organizationId");
  });

  it("normalizes initial-owner email in the provisioning command", () => {
    const command = provisionTenantCommandSchema.parse({
      idempotencyKey: ids.event,
      correlationId: ids.correlation,
      name: "Sample Convention",
      subdomain: "sample-con",
      initialOwnerEmail: "OWNER@Example.COM"
    });

    expect(command.initialOwnerEmail).toBe("owner@example.com");
  });

  it("keeps outbound webhook scope explicit", () => {
    const event = webhookEventEnvelopeSchema.parse({
      id: ids.event,
      type: "registration.created",
      orgId: ids.org,
      eventId: ids.correlation,
      createdAt: "2026-07-17T00:00:00.000Z",
      data: { registrationId: ids.user }
    });

    expect(event.orgId).toBe(ids.org);
  });
});
