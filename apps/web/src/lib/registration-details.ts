import { parseStoredFormResponses, type FormField } from "./form-fields";

export type AnswerRow = { questionId: string; label: string; value: string | null };

export function buildAnswerRows(questions: FormField[], responses: unknown): AnswerRow[] {
  const stored = parseStoredFormResponses(responses);
  return questions.map((question) => {
    const value = stored[question.id];
    return {
      questionId: question.id, label: question.label,
      value: typeof value === "boolean" ? (value ? "Yes" : "No") : typeof value === "string" ? value || null : null
    };
  });
}

export type AgreementInput = {
  documentId: string; acceptedAt: Date; source: "ATTENDEE" | "STAFF";
  version: { id: string; version: number; title: string };
  attestedBy: { name: string | null; email: string } | null;
};
export type AgreementRow = {
  documentId: string; title: string; versionId: string | null; acceptedVersion: number | null;
  currentVersion: number | null; acceptedAt: Date | null; source: "ATTENDEE" | "STAFF" | null; staffName: string | null;
};

export function buildAgreementRows(
  current: Array<{ documentId: string; version: number; title: string }>, agreements: AgreementInput[]
): AgreementRow[] {
  const byDocument = new Map(agreements.map((agreement) => [agreement.documentId, agreement]));
  const row = (documentId: string, title: string, currentVersion: number | null): AgreementRow => {
    const agreement = byDocument.get(documentId);
    return {
      documentId, title, currentVersion, versionId: agreement?.version.id ?? null,
      acceptedVersion: agreement?.version.version ?? null, acceptedAt: agreement?.acceptedAt ?? null,
      source: agreement?.source ?? null, staffName: agreement?.attestedBy?.name ?? agreement?.attestedBy?.email ?? null
    };
  };
  const currentIds = new Set(current.map((policy) => policy.documentId));
  return [
    ...current.map((policy) => row(policy.documentId, policy.title, policy.version)),
    ...agreements.filter((agreement) => !currentIds.has(agreement.documentId))
      .map((agreement) => row(agreement.documentId, agreement.version.title, null))
  ];
}
