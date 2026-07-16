import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createRegistrationTransferToken,
  getRegistrationTransferLandingPath,
  getRegistrationTransferPath,
  hashRegistrationTransferToken,
  normalizeTransferEmail
} from "./registration-transfer";
import { safeReturnTo } from "./return-to";

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
    expect(getRegistrationTransferLandingPath("request-id", token)).toBe(`/transfer/request-id?token=${token}`);
    expect(getRegistrationTransferPath("request-id", token)).toBe(`/account/transfers/request-id?token=${token}`);
    expect(safeReturnTo(getRegistrationTransferPath("request-id", token))).toBe(
      `/account/transfers/request-id?token=${token}`
    );
  });
});
