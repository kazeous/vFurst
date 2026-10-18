import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRegistrationTransferToken,
  formatTransferExpiry,
  getRegistrationTransferUrl,
  getRegistrationTransferPath,
  hashRegistrationTransferToken,
  normalizeTransferEmail
} from "./registration-transfer";
import { safeReturnTo } from "./return-to";

afterEach(() => vi.unstubAllEnvs());

describe("registration transfer credentials", () => {
  it("creates a high-entropy single-use secret while persisting only its SHA-256 hash", () => {
    const first = createRegistrationTransferToken();
    const second = createRegistrationTransferToken();

    expect(first.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.tokenHash).not.toBe(first.rawToken);
    expect(first.tokenHash).toBe(createHash("sha256").update(first.rawToken).digest("hex"));
    expect(second.rawToken).not.toBe(first.rawToken);
    expect(hashRegistrationTransferToken(first.rawToken)).toBe(first.tokenHash);
    expect(first.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("normalizes recipient identity and keeps signed local handoff paths", () => {
    const token = "a".repeat(43);
    expect(normalizeTransferEmail(" Recipient@Example.COM ")).toBe("recipient@example.com");
    expect(getRegistrationTransferPath("request-id", token)).toBe(`/account/transfers/request-id?token=${token}`);
    expect(safeReturnTo(getRegistrationTransferPath("request-id", token))).toBe(
      `/account/transfers/request-id?token=${token}`
    );
  });

  it("builds the transfer link on the canonical portal host", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "localhost");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    const org = { subdomain: "acme", customDomain: null, customDomainStatus: null };
    const token = "a".repeat(43);

    expect(getRegistrationTransferUrl(org, "r1", token)).toBe(
      `http://acme.localhost:3000/account/transfers/r1?token=${token}`
    );
    expect(getRegistrationTransferUrl({ ...org, customDomain: "tickets.acme.test", customDomainStatus: "ACTIVE" }, "r1", token)).toBe(
      `http://tickets.acme.test:3000/account/transfers/r1?token=${token}`
    );
  });
});

describe("formatTransferExpiry", () => {
  it("states the expiry day-first in UTC for the invitation email", () => {
    expect(formatTransferExpiry(new Date("2026-07-23T12:00:00Z"))).toBe("23 Jul 2026, 12:00 UTC");
    expect(formatTransferExpiry(new Date("2026-07-23T23:30:00-05:00"))).toBe("24 Jul 2026, 04:30 UTC");
  });
});
