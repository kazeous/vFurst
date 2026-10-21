import { describe, expect, it } from "vitest";
import { badgeOutputMessage, badgeOutputStatus } from "./badge-output-status";

const empty = { generatedAt: null, printedAt: null, renderIssue: null };
const date = "2026-10-21T12:00:00.000Z";

describe("badge output status", () => {
  it("reports printed before other states", () => {
    expect(badgeOutputStatus({ generatedAt: date, printedAt: date, renderIssue: "Printed without: 🦊" })).toBe("printed");
  });
  it("reports ready for generated output", () => {
    expect(badgeOutputStatus({ ...empty, generatedAt: date })).toBe("ready");
  });
  it("reports failed for a render issue without output", () => {
    expect(badgeOutputStatus({ ...empty, renderIssue: "Nothing printable." })).toBe("failed");
  });
  it("reports queued without output or an issue", () => {
    expect(badgeOutputStatus(empty)).toBe("queued");
  });
  it("describes clean output", () => {
    expect(badgeOutputMessage({ ...empty, generatedAt: date })).toBe("Badge output is ready.");
  });
  it("includes the note for rendered output", () => {
    expect(badgeOutputMessage({ ...empty, generatedAt: date, renderIssue: "Printed without: 🦊" })).toBe("Badge output is ready. Printed without: 🦊");
  });
  it("includes the reason for failed output", () => {
    expect(badgeOutputMessage({ ...empty, renderIssue: "Nothing printable." })).toBe("Badge could not be rendered: Nothing printable.");
  });
  it("describes queued output", () => {
    expect(badgeOutputMessage(empty)).toBe("Badge output is waiting for the render worker.");
  });
});
