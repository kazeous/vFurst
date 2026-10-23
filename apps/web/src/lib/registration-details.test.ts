import { describe, expect, it } from "vitest";
import type { FormField } from "./form-fields";
import { buildAgreementRows, buildAnswerRows } from "./registration-details";

describe("registration details", () => {
  it("answer rows show a stored option that no longer exists", () => {
    const questions: FormField[] = [{ id: "size", label: "Size", type: "select", required: true, options: ["S", "M"] }];
    expect(buildAnswerRows(questions, { size: "XL" })).toEqual([{ questionId: "size", label: "Size", value: "XL" }]);
  });

  it("booleans read Yes/No; missing reads null", () => {
    const questions: FormField[] = ["yes", "no", "missing", "empty"].map((id) => ({ id, label: id, type: "checkbox", required: false }));
    expect(buildAnswerRows(questions, { yes: true, no: false, empty: "" }).map((row) => row.value)).toEqual(["Yes", "No", null, null]);
    expect(buildAnswerRows(questions, null).every((row) => row.value === null)).toBe(true);
  });

  it("agreement rows flag outdated versions, list not-recorded current policies, and append archived ones", () => {
    const acceptedAt = new Date("2026-10-01T00:00:00Z");
    const rows = buildAgreementRows([
      { documentId: "current", version: 2, title: "New title" },
      { documentId: "missing", version: 1, title: "New policy" }
    ], [
      { documentId: "archived", acceptedAt, source: "STAFF", version: { id: "v3", version: 3, title: "Archived title" }, attestedBy: { name: null, email: "staff@example.com" } },
      { documentId: "current", acceptedAt, source: "ATTENDEE", version: { id: "v1", version: 1, title: "Old title" }, attestedBy: null }
    ]);
    expect(rows).toEqual([
      { documentId: "current", title: "New title", versionId: "v1", acceptedVersion: 1, currentVersion: 2, acceptedAt, source: "ATTENDEE", staffName: null },
      { documentId: "missing", title: "New policy", versionId: null, acceptedVersion: null, currentVersion: 1, acceptedAt: null, source: null, staffName: null },
      { documentId: "archived", title: "Archived title", versionId: "v3", acceptedVersion: 3, currentVersion: null, acceptedAt, source: "STAFF", staffName: "staff@example.com" }
    ]);
  });
});
