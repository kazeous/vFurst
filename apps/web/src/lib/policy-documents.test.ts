import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@vfurst/db";
import { z } from "zod";
import { ExpectedActionError, PublicActionError, publicActionErrorMessage } from "./public-action-error";
import {
  POLICY_BODY_MAX, POLICY_TITLE_MAX, PolicyChangedError,
  assertAttendeeAgreements, assertStaffAttestation,
  checkAttendeeAgreements, checkStaffAttestation, getCurrentPolicyVersions,
  parsePolicyVersionInput, readAttendeeAgreements, readStaffAttestation, writeAgreements,
  type CurrentPolicyVersion
} from "./policy-documents";

const policies: CurrentPolicyVersion[] = [
  { documentId: "conduct", versionId: "conduct-v2", version: 2, title: "Conduct", body: "Be kind." },
  { documentId: "privacy", versionId: "privacy-v1", version: 1, title: "Privacy", body: "Your data." }
];

function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function agreedForm() {
  return form({
    shownPolicyVersions: "conduct-v2,privacy-v1",
    "agreement-conduct": "conduct-v2", "agreement-privacy": "privacy-v1"
  });
}

describe("current policy versions", () => {
  it("selects the highest version of non-archived documents in order", async () => {
    const findMany = vi.fn().mockResolvedValue(policies.map((policy) => ({
      id: policy.documentId,
      versions: [{ id: policy.versionId, version: policy.version, title: policy.title, body: policy.body }]
    })));
    const client = { policyDocument: { findMany } } as unknown as Pick<Prisma.TransactionClient, "policyDocument">;
    await expect(getCurrentPolicyVersions(client, { orgId: "org", eventId: "event" })).resolves.toEqual(policies);
    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany).toHaveBeenCalledWith({
      where: { orgId: "org", eventId: "event", archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        versions: { orderBy: { version: "desc" }, take: 1, select: { id: true, version: true, title: true, body: true } }
      }
    });
  });
});

describe("attendee agreements", () => {
  it("reads displayed versions and agreement fields only", () => {
    const data = agreedForm();
    data.set("unrelated", "ignored");
    expect(readAttendeeAgreements(data)).toEqual({
      shownVersionIds: ["conduct-v2", "privacy-v1"],
      agreed: new Map([["conduct", "conduct-v2"], ["privacy", "privacy-v1"]])
    });
    expect(readAttendeeAgreements(new FormData())).toEqual({ shownVersionIds: [], agreed: new Map() });
  });

  it.each([
    ["version changed", [{ ...policies[0]!, versionId: "conduct-v3", version: 3 }, policies[1]!]],
    ["document added", [...policies, { documentId: "terms", versionId: "terms-v1", version: 1, title: "Terms", body: "Terms." }]],
    ["document archived", [policies[0]!]],
    ["all documents archived", []]
  ])("is stale when a %s after display", (_, current) => {
    expect(checkAttendeeAgreements(current, readAttendeeAgreements(agreedForm()))).toBe("stale");
  });

  it("is missing when a displayed policy was not ticked or agreed to a different version", () => {
    const data = agreedForm();
    data.delete("agreement-privacy");
    expect(checkAttendeeAgreements(policies, readAttendeeAgreements(data))).toBe("missing");
    data.set("agreement-privacy", "privacy-v0");
    expect(checkAttendeeAgreements(policies, readAttendeeAgreements(data))).toBe("missing");
  });

  it.each(["unknown", "foreign-version"])("an %s version id is stale, before checking missing agreements", (id) => {
    expect(checkAttendeeAgreements(policies, readAttendeeAgreements(form({ shownPolicyVersions: `conduct-v2,${id}` })))).toBe("stale");
  });

  it("compares sets so display order and duplicate ids do not affect agreement checks", () => {
    const data = agreedForm();
    data.set("shownPolicyVersions", "privacy-v1,conduct-v2,conduct-v2");
    expect(checkAttendeeAgreements(policies, readAttendeeAgreements(data))).toBe("ok");
  });

  it("no policies and nothing shown is ok", () => {
    expect(checkAttendeeAgreements([], readAttendeeAgreements(new FormData()))).toBe("ok");
    expect(() => assertAttendeeAgreements([], new FormData())).not.toThrow();
  });

  it("assertAttendeeAgreements throws PolicyChangedError for stale", () => {
    const data = agreedForm();
    data.set("shownPolicyVersions", "old-version");
    expect(() => assertAttendeeAgreements(policies, data)).toThrow(PolicyChangedError);
    const error = new PolicyChangedError();
    expect(error).toBeInstanceOf(ExpectedActionError);
    expect(error.name).toBe("PolicyChangedError");
    expect(publicActionErrorMessage(error)).toBe("This policy was updated; please review it again.");
  });

  it("uses PublicActionError and the exact missing copy; accepts all current agreements", () => {
    const data = agreedForm();
    expect(() => assertAttendeeAgreements(policies, data)).not.toThrow();
    data.delete("agreement-conduct");
    expect(() => assertAttendeeAgreements(policies, data)).toThrow(PublicActionError);
    expect(() => assertAttendeeAgreements(policies, data)).toThrow("Agree to every policy to continue.");
  });
});

describe("staff attestation", () => {
  it("reads staff version ids and requires the on checkbox value", () => {
    expect(readStaffAttestation(form({ attestedPolicyVersions: "conduct-v2,privacy-v1", policyAttestation: "on" })))
      .toEqual({ attestedVersionIds: ["conduct-v2", "privacy-v1"], confirmed: true });
    expect(readStaffAttestation(new FormData())).toEqual({ attestedVersionIds: [], confirmed: false });
    expect(readStaffAttestation(form({ policyAttestation: "true" })).confirmed).toBe(false);
  });

  it("empty current is ok without confirmation even when old versions were displayed", () => {
    expect(checkStaffAttestation([], { attestedVersionIds: [], confirmed: false })).toBe("ok");
    expect(checkStaffAttestation([], { attestedVersionIds: ["old-version"], confirmed: false })).toBe("ok");
    expect(() => assertStaffAttestation([], form({ attestedPolicyVersions: "old-version" }))).not.toThrow();
  });

  it("mismatch is stale before confirmation; unconfirmed is missing", () => {
    expect(checkStaffAttestation(policies, { attestedVersionIds: ["conduct-v2"], confirmed: false })).toBe("stale");
    expect(checkStaffAttestation(policies, { attestedVersionIds: ["conduct-v2", "privacy-v1"], confirmed: false })).toBe("missing");
    expect(checkStaffAttestation(policies, { attestedVersionIds: ["privacy-v1", "conduct-v2", "conduct-v2"], confirmed: true })).toBe("ok");
  });

  it("asserts with ExpectedActionError and the exact staff copy", () => {
    expect(() => assertStaffAttestation(policies, new FormData())).toThrow(ExpectedActionError);
    expect(() => assertStaffAttestation(policies, new FormData())).toThrow("The event policies changed. Review them and confirm again.");
    const data = form({ attestedPolicyVersions: "conduct-v2,privacy-v1" });
    expect(() => assertStaffAttestation(policies, data)).toThrow(ExpectedActionError);
    expect(() => assertStaffAttestation(policies, data)).toThrow("Confirm that the attendee has agreed to the event policies.");
    data.set("policyAttestation", "on");
    expect(() => assertStaffAttestation(policies, data)).not.toThrow();
  });
});

describe("agreement writes", () => {
  it.each([
    { source: "ATTENDEE", portalAccountId: "account" },
    { source: "STAFF", attestedByUserId: "staff" }
  ] as const)("writes one row per policy with the $source actor's id only", async (actor) => {
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const tx = { registrationAgreement: { createMany } } as unknown as Pick<Prisma.TransactionClient, "registrationAgreement">;
    await writeAgreements(tx, { orgId: "org", eventId: "event", registrationId: "registration", current: policies, actor });
    expect(createMany).toHaveBeenCalledOnce();
    expect(createMany).toHaveBeenCalledWith({ data: policies.map((policy) => ({
      orgId: "org", eventId: "event", registrationId: "registration", documentId: policy.documentId,
      documentVersionId: policy.versionId, ...actor
    })) });
    const rows = createMany.mock.calls[0]![0].data;
    for (const row of rows) {
      expect(row[actor.source === "ATTENDEE" ? "attestedByUserId" : "portalAccountId"]).toBeUndefined();
    }
  });

  it("does not write when there are no policies", async () => {
    const createMany = vi.fn();
    const tx = { registrationAgreement: { createMany } } as unknown as Pick<Prisma.TransactionClient, "registrationAgreement">;
    await writeAgreements(tx, { orgId: "org", eventId: "event", registrationId: "registration", current: [], actor: { source: "ATTENDEE", portalAccountId: "account" } });
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe("policy version input", () => {
  it.each([
    [{ title: " \t ", body: "Text" }, "Enter a title."],
    [{ title: "x".repeat(121), body: "Text" }, "Title must be 120 characters or fewer."],
    [{ title: "Title", body: "" }, "Enter the policy text."],
    [{ title: "Title", body: "x".repeat(100_001) }, "Policy text must be 100,000 characters or fewer."]
  ])("enforces title and body limits with exact copy (%#)", (values, message) => {
    try {
      parsePolicyVersionInput(form(values));
      expect.fail("Expected policy validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(z.ZodError);
      expect((error as z.ZodError).issues[0]?.message).toBe(message);
    }
  });

  it("accepts inclusive limits after trimming the title and normalizing CRLF to LF", () => {
    expect(POLICY_TITLE_MAX).toBe(120);
    expect(POLICY_BODY_MAX).toBe(100_000);
    const body = "x\r\n".repeat(50_000);
    expect(parsePolicyVersionInput(form({ title: ` ${"x".repeat(POLICY_TITLE_MAX)} `, body })))
      .toEqual({ title: "x".repeat(POLICY_TITLE_MAX), body: "x\n".repeat(50_000) });
    expect(() => parsePolicyVersionInput(form({ title: "Title", body: `${body}x` }))).toThrow("Policy text must be 100,000 characters or fewer.");
    expect(parsePolicyVersionInput(form({ title: "Title", body: "  Text\r\n" })).body).toBe("  Text\n");
    expect(() => parsePolicyVersionInput(new FormData())).toThrow(z.ZodError);
  });
});
