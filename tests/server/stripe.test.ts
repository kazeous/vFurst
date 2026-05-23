import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("Stripe webhook signature verification", () => {
  it("accepts a valid signature", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_local");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_local");
    vi.stubEnv("AUTH_URL", "http://localhost:3000");

    const { verifyStripeSignature } = await import("@/server/stripe");
    const rawBody = JSON.stringify({ id: "evt_123", type: "checkout.session.completed" });
    const timestamp = "1779534000";
    const signature = createHmac("sha256", "whsec_local").update(`${timestamp}.${rawBody}`).digest("hex");

    expect(() => verifyStripeSignature(rawBody, `t=${timestamp},v1=${signature}`)).not.toThrow();
  });

  it("rejects an invalid signature", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_local");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_local");
    vi.stubEnv("AUTH_URL", "http://localhost:3000");

    const { verifyStripeSignature } = await import("@/server/stripe");

    expect(() => verifyStripeSignature("{}", "t=1779534000,v1=00")).toThrow("Invalid Stripe signature");
  });
});
