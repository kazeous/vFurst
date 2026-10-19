import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPortalCheckoutUrls } from "./checkout-urls";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "localhost");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
});

afterEach(() => vi.unstubAllEnvs());

describe("portal checkout URLs", () => {
  it("builds portal checkout and Stripe return URLs on the subdomain host", () => {
    expect(getPortalCheckoutUrls({ subdomain: "acme", customDomain: null, customDomainStatus: null }, "o1", "t/1")).toEqual({
      checkoutUrl: "http://acme.localhost:3000/checkout/o1?token=t%2F1",
      successUrl: "http://acme.localhost:3000/checkout/o1?token=t%2F1&returned=stripe",
      cancelUrl: "http://acme.localhost:3000/checkout/o1?token=t%2F1&cancelled=stripe"
    });
  });

  it("uses the active custom domain", () => {
    expect(getPortalCheckoutUrls({ subdomain: "acme", customDomain: "tickets.acme.test", customDomainStatus: "ACTIVE" }, "o1", "t/1")).toEqual({
      checkoutUrl: "http://tickets.acme.test:3000/checkout/o1?token=t%2F1",
      successUrl: "http://tickets.acme.test:3000/checkout/o1?token=t%2F1&returned=stripe",
      cancelUrl: "http://tickets.acme.test:3000/checkout/o1?token=t%2F1&cancelled=stripe"
    });
  });
});
