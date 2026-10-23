import { describe, expect, it } from "vitest";
import type { FormField } from "./form-fields";
import { serializeCsv } from "./csv";
import { buildAgreementRows, buildAnswerRows, registrationExportCells, registrationExportHeader } from "./registration-details";

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

  it("export header lists question labels then two columns per policy", () => {
    const questions: FormField[] = [
      { id: "size", label: "Shirt size", type: "select", required: true, options: ["S", "M"] },
      { id: "access", label: "Access needs", type: "textarea", required: false }
    ];
    expect(registrationExportHeader(questions, [
      { documentId: "conduct", title: "Code of conduct" }, { documentId: "refund", title: "Refund policy" }
    ])).toEqual(["Shirt size", "Access needs", "Code of conduct version", "Code of conduct accepted at", "Refund policy version", "Refund policy accepted at"]);
    expect(registrationExportHeader([], [])).toEqual([]);
  });

  it("export cells leave unanswered and unagreed cells empty", () => {
    const questions: FormField[] = [
      { id: "size", label: "Size", type: "select", required: true, options: ["S", "M"] },
      { id: "missing", label: "Missing", type: "text", required: true },
      { id: "yes", label: "Yes", type: "checkbox", required: false },
      { id: "no", label: "No", type: "checkbox", required: false },
      { id: "formula", label: "=Question", type: "text", required: false }
    ];
    const current = [{ documentId: "conduct", title: "Conduct" }, { documentId: "refund", title: "Refund" }];
    const cells = registrationExportCells(questions, current, {
      formResponses: { size: "XL", yes: true, no: false, formula: "=SUM(A1:A2)", deleted: "Hidden answer" },
      agreements: [
        { documentId: "archived", acceptedAt: new Date("2026-09-01T01:00:00Z"), version: { version: 9 } },
        { documentId: "conduct", acceptedAt: new Date("2026-10-01T12:30:00Z"), version: { version: 2 } }
      ]
    });
    expect(cells).toEqual(["XL", "", "Yes", "No", "=SUM(A1:A2)", 2, "2026-10-01T12:30:00.000Z", "", ""]);
    expect(registrationExportCells(questions, current, { formResponses: null, agreements: [] })).toEqual(["", "", "", "", "", "", "", "", ""]);
    const csv = serializeCsv([registrationExportHeader(questions, current), cells]);
    expect(csv).toContain('"\'=Question"');
    expect(csv).toContain('"\'=SUM(A1:A2)"');
  });

  it("export never includes contacts", () => {
    const registration = {
      formResponses: { name: "Answer" }, agreements: [],
      attendeeProfile: { emergencyContacts: [{ name: "Emergency only", country: "VN", phone: "+84901234567" }] }
    };
    const cells = registrationExportCells([{ id: "name", label: "Name", type: "text", required: false }], [], registration);
    expect(cells).toEqual(["Answer"]);
    expect(JSON.stringify(cells)).not.toContain("+84");
    expect(JSON.stringify(cells)).not.toContain("Emergency only");
    expect(registrationExportCells([], [], registration)).toEqual([]);
  });
});
