import { describe, expect, it } from "vitest";
import { renderEmailTemplate } from "./index.js";

describe("registration transfer email", () => {
  it("renders the signed account link and escapes recipient-controlled values", () => {
    const rendered = renderEmailTemplate("registration-transfer", {
      eventName: "Demo <Event>\r\nBcc: attacker@example.com",
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
});
