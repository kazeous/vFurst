import { describe, expect, it } from "vitest";
import { renderEmailTemplate } from "./index.js";

describe("organization invitation email", () => {
  it("renders the single-use acceptance link and escapes HTML values", () => {
    const rendered = renderEmailTemplate("organization-invitation", {
      organizationName: "<Demo & Co>\r\nBcc: attacker@example.com",
      role: "ADMIN",
      invitationUrl: "https://vfurst.example/invitations/token?a=1&b=2",
      expiresAt: "2026-07-21T12:00:00.000Z"
    });

    expect(rendered.subject).toBe("You're invited to <Demo & Co> Bcc: attacker@example.com");
    expect(rendered.subject).not.toContain("\n");
    expect(rendered.html).toContain("&lt;Demo &amp; Co&gt;");
    expect(rendered.html).toContain("a=1&amp;b=2");
    expect(rendered.text).toContain("https://vfurst.example/invitations/token?a=1&b=2");
  });
});
