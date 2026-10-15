import { describe, expect, it } from "vitest";
import { renderEmailTemplate } from "./index.js";

describe("registration transfer email", () => {
  it("renders the signed account link and escapes recipient-controlled values", () => {
    const rendered = renderEmailTemplate("registration-transfer", {
      eventName: "Demo <Event>\r\nBcc: attacker@example.com",
      organizationName: "<Acme>",
      sourceName: "Source & Owner",
      recipientName: "<Recipient>",
      transferUrl: "https://vfurst.example/transfer/request?token=a&next=b",
      expiresAt: "Jul 23, 2026, 12:00 PM UTC"
    });

    expect(rendered.subject).not.toContain("\n");
    expect(rendered.html).toContain("Demo &lt;Event&gt;");
    expect(rendered.html).toContain("Source &amp; Owner");
    expect(rendered.html).toContain("&lt;Recipient&gt;");
    expect(rendered.html).toContain("token=a&amp;next=b");
    expect(rendered.text).toContain("https://vfurst.example/transfer/request?token=a&next=b");
  });

  it("names the organization portal and escapes it", () => {
    const rendered = renderEmailTemplate("registration-transfer", {
      organizationName: "<Acme>",
      eventName: "Demo Event",
      sourceName: "Source Owner",
      transferUrl: "https://acme.example/account/transfers/request?token=a",
      expiresAt: "Jul 23, 2026, 12:00 PM UTC"
    });

    expect(rendered.html).toContain("your account on the &lt;Acme&gt; portal");
    expect(rendered.text).toContain("your account on the <Acme> portal");
    expect(rendered.text).toContain("If you do not have an account there yet, create one with this email address first:");
  });
});
