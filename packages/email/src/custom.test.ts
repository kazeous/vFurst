import { describe, expect, it } from "vitest";
import {
  getEventEmailTemplate,
  parseEventEmailTemplate,
  renderCustomEmailTemplate
} from "./custom.js";

describe("event email template contract", () => {
  it("renders only allowlisted variables and escapes their values per output", () => {
    const template = parseEventEmailTemplate("registration-confirmation", {
      subject: "Welcome {{attendee.name}}\nInjected",
      html: "<p>{{attendee.name}}</p><p>{{event.name}}</p>",
      text: "Hello {{attendee.name}} at {{event.name}}"
    });

    const rendered = renderCustomEmailTemplate("registration-confirmation", template, {
      attendeeName: "<Sam & Co>",
      eventName: "Con <2027>"
    });

    expect(rendered.subject).toBe("Welcome <Sam & Co> Injected");
    expect(rendered.html).toContain("&lt;Sam &amp; Co&gt;");
    expect(rendered.html).toContain("Con &lt;2027&gt;");
    expect(rendered.text).toBe("Hello <Sam & Co> at Con <2027>");
  });

  it("rejects a variable outside the message allowlist", () => {
    expect(() =>
      parseEventEmailTemplate("payment-receipt", {
        subject: "Receipt {{attendee.email}}",
        html: "<p>Receipt</p>",
        text: "Receipt"
      })
    ).toThrow("is not allowed");
  });

  it("removes unsafe transfer URLs instead of rendering javascript links", () => {
    const template = parseEventEmailTemplate("transfer-request", {
      subject: "Transfer",
      html: "<a href=\"{{transfer.url}}\">Open</a>",
      text: "{{transfer.url}}"
    });

    const rendered = renderCustomEmailTemplate("transfer-request", template, {
      transferUrl: "javascript:alert(1)"
    });

    expect(rendered.html).toBe('<a href="">Open</a>');
    expect(rendered.text).toBe("");
  });

  it("fails closed to the built-in renderer when stored settings are invalid", () => {
    expect(
      getEventEmailTemplate(
        {
          emailTemplates: {
            "registration-confirmation": {
              subject: "Broken {{attendee.email}}",
              html: "<p>Broken</p>",
              text: "Broken"
            }
          }
        },
        "registration-confirmation"
      )
    ).toBeNull();
  });
});
