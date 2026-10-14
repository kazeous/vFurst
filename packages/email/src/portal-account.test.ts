import { describe, expect, it } from "vitest";
import { renderEmailTemplate } from "./index.js";

describe("portal account emails", () => {
  it("renders the setup email with an escaped link and organization name", () => {
    const r = renderEmailTemplate("portal-account-setup", { organizationName: "Fur & Fest", setupUrl: 'https://a.test/set-password?token=x&returnTo="/"' });
    expect(r.subject).toBe("Finish creating your Fur & Fest account");
    expect(r.html).toContain("Fur &amp; Fest");
    expect(r.html).toContain("token=x&amp;returnTo=&quot;/&quot;");
    expect(r.text).toContain('https://a.test/set-password?token=x&returnTo="/"');
    expect(r.text).toContain("expires in one hour");
  });
  it("renders the reset email", () => {
    const r = renderEmailTemplate("portal-password-reset", { organizationName: "Acme Con", resetUrl: "https://a.test/r" });
    expect(r.subject).toBe("Reset your Acme Con account password");
    expect(r.text).toContain("https://a.test/r");
  });
  it("renders the account-exists notice with sign-in and reset links", () => {
    const r = renderEmailTemplate("portal-account-exists", { organizationName: "Acme Con", signInUrl: "https://a.test/login", resetUrl: "https://a.test/forgot-password" });
    expect(r.subject).toBe("You already have an Acme Con account");
    expect(r.text).toContain("https://a.test/login");
    expect(r.text).toContain("https://a.test/forgot-password");
  });
});
