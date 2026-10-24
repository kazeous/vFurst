import type { Prisma } from "@vfurst/db";
import { z } from "zod";
import { ExpectedActionError, PublicActionError } from "@/lib/public-action-error";

export const POLICY_TITLE_MAX = 120;
export const POLICY_BODY_MAX = 100_000;

export type CurrentPolicySummary = {
  documentId: string;
  versionId: string;
  version: number;
  title: string;
};
export type CurrentPolicyVersion = CurrentPolicySummary & { body: string };

type PolicyClient = Pick<Prisma.TransactionClient, "policyDocument">;

function findCurrentPolicies(client: PolicyClient, input: { orgId: string; eventId: string }, withBody: boolean) {
  return client.policyDocument.findMany({
    where: { orgId: input.orgId, eventId: input.eventId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      versions: {
        orderBy: { version: "desc" }, take: 1,
        select: { id: true, version: true, title: true, body: withBody }
      }
    }
  });
}

/** Current policies without their text, for agreement checks and listings. */
export async function getCurrentPolicySummaries(client: PolicyClient, input: { orgId: string; eventId: string }): Promise<CurrentPolicySummary[]> {
  const documents = await findCurrentPolicies(client, input, false);
  return documents.flatMap((document) => {
    const version = document.versions[0];
    return version ? [{ documentId: document.id, versionId: version.id, version: version.version, title: version.title }] : [];
  });
}

export async function getCurrentPolicyVersions(client: PolicyClient, input: { orgId: string; eventId: string }): Promise<CurrentPolicyVersion[]> {
  const documents = await findCurrentPolicies(client, input, true);
  return documents.flatMap((document) => {
    const version = document.versions[0];
    return version ? [{ documentId: document.id, versionId: version.id, version: version.version, title: version.title, body: version.body }] : [];
  });
}

export type AgreementCheck = "ok" | "missing" | "stale";

function readVersionIds(formData: FormData, name: string): string[] {
  const value = formData.get(name);
  return typeof value === "string" ? value.split(",").filter(Boolean) : [];
}

export function readAttendeeAgreements(formData: FormData): { shownVersionIds: string[]; agreed: Map<string, string> } {
  const agreed = new Map<string, string>();
  formData.forEach((value, key) => {
    if (key.startsWith("agreement-") && typeof value === "string") {
      agreed.set(key.slice("agreement-".length), value);
    }
  });
  return { shownVersionIds: readVersionIds(formData, "shownPolicyVersions"), agreed };
}

function matchesCurrentVersions(current: CurrentPolicySummary[], versionIds: string[]): boolean {
  const currentIds = new Set(current.map((policy) => policy.versionId));
  const submittedIds = new Set(versionIds);
  return currentIds.size === submittedIds.size && [...currentIds].every((id) => submittedIds.has(id));
}

export function checkAttendeeAgreements(
  current: CurrentPolicySummary[],
  submission: ReturnType<typeof readAttendeeAgreements>
): AgreementCheck {
  if (!matchesCurrentVersions(current, submission.shownVersionIds)) return "stale";
  if (current.some((policy) => submission.agreed.get(policy.documentId) !== policy.versionId)) return "missing";
  return "ok";
}

export function readStaffAttestation(formData: FormData): { attestedVersionIds: string[]; confirmed: boolean } {
  return {
    attestedVersionIds: readVersionIds(formData, "attestedPolicyVersions"),
    confirmed: formData.get("policyAttestation") === "on"
  };
}

export function checkStaffAttestation(
  current: CurrentPolicySummary[],
  attestation: ReturnType<typeof readStaffAttestation>
): AgreementCheck {
  if (current.length === 0) return "ok";
  if (!matchesCurrentVersions(current, attestation.attestedVersionIds)) return "stale";
  return attestation.confirmed ? "ok" : "missing";
}

export class PolicyChangedError extends ExpectedActionError {
  constructor() {
    super("This policy was updated; please review it again.");
    this.name = "PolicyChangedError";
  }
}

export function assertAttendeeAgreements(current: CurrentPolicySummary[], formData: FormData): void {
  const check = checkAttendeeAgreements(current, readAttendeeAgreements(formData));
  if (check === "stale") throw new PolicyChangedError();
  if (check === "missing") throw new PublicActionError("Agree to every policy to continue.");
}

export function assertStaffAttestation(current: CurrentPolicySummary[], formData: FormData): void {
  const check = checkStaffAttestation(current, readStaffAttestation(formData));
  if (check === "stale") throw new ExpectedActionError("The event policies changed. Review them and confirm again.");
  if (check === "missing") throw new ExpectedActionError("Confirm that the attendee has agreed to the event policies.");
}

export async function writeAgreements(
  tx: Pick<Prisma.TransactionClient, "registrationAgreement">,
  input: {
    orgId: string; eventId: string; registrationId: string; current: CurrentPolicySummary[];
    actor: { source: "ATTENDEE"; portalAccountId: string } | { source: "STAFF"; attestedByUserId: string };
  }
): Promise<void> {
  if (input.current.length === 0) return;
  const actor = input.actor.source === "ATTENDEE"
    ? { source: input.actor.source, portalAccountId: input.actor.portalAccountId }
    : { source: input.actor.source, attestedByUserId: input.actor.attestedByUserId };
  await tx.registrationAgreement.createMany({
    data: input.current.map((policy) => ({
      orgId: input.orgId, eventId: input.eventId, registrationId: input.registrationId,
      documentId: policy.documentId, documentVersionId: policy.versionId, ...actor
    }))
  });
}

const policyVersionInputSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(POLICY_TITLE_MAX, "Title must be 120 characters or fewer."),
  body: z.string().transform((value) => value.replace(/\r\n/g, "\n"))
    .pipe(z.string().min(1, "Enter the policy text.").max(POLICY_BODY_MAX, "Policy text must be 100,000 characters or fewer."))
});

export function parsePolicyVersionInput(formData: FormData): { title: string; body: string } {
  const title = formData.get("title");
  const body = formData.get("body");
  return policyVersionInputSchema.parse({
    title: typeof title === "string" ? title : "",
    body: typeof body === "string" ? body : ""
  });
}
