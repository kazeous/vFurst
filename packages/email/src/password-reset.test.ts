import { describe, expect, it } from "vitest";
import { renderEmailTemplate } from "./index.js";

describe("password reset email", () => {
  it("escapes the reset URL inside the HTML href while preserving plain text", () => {
    const resetUrl = 'https://accounts.example.test/reset?token=abc&returnTo="/account"';
    const rendered = renderEmailTemplate("password-reset", { resetUrl });

    expect(rendered.html).toContain("token=abc&amp;returnTo=&quot;/account&quot;");
    expect(rendered.html).not.toContain('returnTo="/account"');
    expect(rendered.text).toContain(resetUrl);
  });
});
