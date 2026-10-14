import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashCheckoutToken } from "./checkout-token";

const hmac = (secret: string) => createHmac("sha256", secret).update("token").digest("hex");

describe("checkout token secret", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("falls back to AUTH_SECRET when CHECKOUT_TOKEN_SECRET is empty", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CHECKOUT_TOKEN_SECRET", "");
    vi.stubEnv("AUTH_SECRET", "auth-secret-for-test");
    expect(hashCheckoutToken("token")).toBe(hmac("auth-secret-for-test"));
  });

  it("prefers a non-empty CHECKOUT_TOKEN_SECRET", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CHECKOUT_TOKEN_SECRET", "checkout-secret-for-test");
    vi.stubEnv("AUTH_SECRET", "auth-secret-for-test");
    expect(hashCheckoutToken("token")).toBe(hmac("checkout-secret-for-test"));
  });

  it("throws in production when both secrets are empty", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CHECKOUT_TOKEN_SECRET", "");
    vi.stubEnv("AUTH_SECRET", "");
    expect(() => hashCheckoutToken("token")).toThrow("CHECKOUT_TOKEN_SECRET is not configured.");
  });

  it("uses the local development secret when both are empty outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CHECKOUT_TOKEN_SECRET", "");
    vi.stubEnv("AUTH_SECRET", "");
    expect(hashCheckoutToken("token")).toBe(hmac("vfurst-local-checkout-secret"));
  });
});
