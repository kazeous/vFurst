import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("server email rendering", () => {
  it("renders allowlisted placeholders without evaluating expressions", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/vfurst?schema=public");
    vi.stubEnv("AUTH_SECRET", "abcdefghijklmnopqrstuvwxyz123456");
    vi.stubEnv("AUTH_URL", "http://localhost:3000");
    const { renderTemplateString } = await import("@/server/email");

    expect(renderTemplateString("Hello {{ attendee.firstName }} {{ process.env.SECRET }}", {
      attendee: { firstName: "Jordan" }
    })).toBe("Hello Jordan ");
  });

  it("escapes substituted values when rendering HTML", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/vfurst?schema=public");
    vi.stubEnv("AUTH_SECRET", "abcdefghijklmnopqrstuvwxyz123456");
    vi.stubEnv("AUTH_URL", "http://localhost:3000");
    const { renderTemplateString } = await import("@/server/email");

    expect(
      renderTemplateString("<p>{{ attendee.firstName }}</p>", {
        attendee: { firstName: "<script>alert(1)</script>" }
      }, { escapeHtmlValues: true })
    ).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });
});

