import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    event: { findUnique: vi.fn() },
    registrationType: { findUnique: vi.fn() },
    attendeeProfile: { findUnique: vi.fn(), updateMany: vi.fn() },
    policyDocument: { findMany: vi.fn() },
    registrationAgreement: { createMany: vi.fn() },
    registration: { count: vi.fn(), create: vi.fn() }
  };
  return {
    tx,
    SerializationConflict: class SerializationConflict extends Error { code = "P2034"; },
    prisma: {
      event: { findFirst: vi.fn() },
      attendeeProfile: { findFirst: vi.fn() },
      cart: { upsert: vi.fn() },
      order: { create: vi.fn() },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    },
    getPortalActionContext: vi.fn(),
    syncPortalAccountName: vi.fn(),
    queueWebhookEvent: vi.fn(),
    markOrderPaid: vi.fn()
  };
});

vi.mock("@vfurst/db", () => ({
  prisma: mocks.prisma,
  Prisma: {
    TransactionIsolationLevel: { Serializable: "Serializable" },
    PrismaClientKnownRequestError: mocks.SerializationConflict
  }
}));
vi.mock("@/lib/dashboard-access", () => ({}));
vi.mock("@/lib/staff-verification", () => ({ requireStaffAssurance: vi.fn() }));
vi.mock("@/lib/email", () => ({}));
vi.mock("@/actions/registration-transfer-actions", () => ({}));
vi.mock("@/lib/fulfillment", () => ({ markOrderPaid: mocks.markOrderPaid }));
vi.mock("@/lib/portal-context", () => ({
  getPortalActionContext: mocks.getPortalActionContext,
  isPortalRedirect: (value: object) => "redirectTo" in value,
  assertPortalResourceOrg: vi.fn()
}));
vi.mock("@/lib/portal-account", () => ({
  assertPortalAccountEmail: vi.fn(),
  syncPortalAccountName: mocks.syncPortalAccountName
}));
vi.mock("@/lib/payments/checkout", () => ({}));
vi.mock("@/lib/payments/platform", () => ({}));
vi.mock("@/lib/payments/stripe", () => ({ REGISTRATION_PLATFORM_FEE_CENTS: 100 }));
vi.mock("@/lib/rate-limit", () => ({
  assertActionRateLimit: vi.fn(),
  RateLimitExceededError: class RateLimitExceededError extends Error {}
}));
vi.mock("@/lib/webhooks", () => ({ queueWebhookEvent: mocks.queueWebhookEvent }));
vi.mock("@/lib/organization-lifecycle", () => ({
  assertOrganizationActive: vi.fn(),
  OrganizationLifecycleError: class OrganizationLifecycleError extends Error {}
}));
vi.mock("@vfurst/auth/invitations", () => ({
  OrganizationInvitationError: class OrganizationInvitationError extends Error {}
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

import { createRegistration } from "./registration-actions";
import { registrationFormFingerprint } from "@/lib/public-registration";
import { getRegistrationForm } from "@/lib/registration-form";

const org = { id: "org-one", status: "ACTIVE" };
const account = { id: "portal-account-one", orgId: org.id, name: "Attendee", email: "attendee@example.com" };
const eventId = "00000000-0000-4000-8000-000000000001";
const typeId = "00000000-0000-4000-8000-000000000002";
const attendeeProfileId = "00000000-0000-4000-8000-000000000003";
const profile = { id: attendeeProfileId, orgId: org.id, portalAccountId: account.id, fullName: "Child Attendee", emergencyContacts: [] };
const contact = { name: "Parent", country: "VN", phone: "+84912345678" };
const otherContact = { name: "Guardian", country: "VN", phone: "+84987654321" };
const policies = [
  { id: "policy-one", versions: [{ id: "version-one", version: 1, title: "Code of conduct", body: "Be kind." }] },
  { id: "policy-two", versions: [{ id: "version-two", version: 2, title: "Refunds", body: "No refunds." }] }
];

function configureDetails() {
  const event = mocks.prisma.event.findFirst.getMockImplementation();
  mocks.prisma.event.findFirst.mockImplementation(async (...args) => ({
    ...await event?.(...args),
    registrationForm: {
      emergencyContacts: { mode: "required", count: 1 },
      questions: [{ id: "diet", type: "text", label: "Diet", required: true }]
    }
  }));
}

function addContact(form: FormData) {
  form.set("contact-0-name", "  Parent  ");
  form.set("contact-0-country", "VN");
  form.set("contact-0-number", "0912 345 678");
  return form;
}

function registrationForm(checkoutMode = "stripe") {
  const form = new FormData();
  form.set("eventId", eventId);
  form.set("typeId", typeId);
  form.set("attendeeProfileId", attendeeProfileId);
  form.set("checkoutMode", checkoutMode);
  return form;
}

describe("registration.created webhook contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPortalActionContext.mockResolvedValue({ org, account });
    mocks.syncPortalAccountName.mockResolvedValue(account);
    mocks.prisma.attendeeProfile.findFirst.mockResolvedValue(profile);
    mocks.tx.attendeeProfile.findUnique.mockResolvedValue(profile);
    mocks.tx.policyDocument.findMany.mockResolvedValue([]);
    mocks.prisma.event.findFirst.mockResolvedValue({
      id: eventId, orgId: org.id, org, currency: "USD", settings: {}, registrationForm: {},
      registrationTypes: [{ id: typeId, name: "Free", price: 0, scheduledPricing: [], addOns: [] }]
    });
    mocks.tx.event.findUnique.mockResolvedValue({ id: eventId, orgId: org.id, settings: {} });
    mocks.tx.registrationType.findUnique.mockResolvedValue({ id: typeId, eventId, orgId: org.id, maxCapacity: null });
    mocks.tx.registration.count.mockResolvedValue(0);
    mocks.tx.registration.create.mockResolvedValue({ id: "registration-one", status: "PENDING" });
    mocks.prisma.order.create.mockResolvedValue({ id: "order-one" });
    mocks.prisma.cart.upsert.mockResolvedValue({ id: "cart-one", orgId: org.id });
  });

  it("creates a portal-owned registration and queues its owner as the external userId", async () => {
    const form = registrationForm();

    await expect(createRegistration({}, form)).resolves.toEqual({ redirectTo: "/register?success=registration-one" });

    expect(mocks.getPortalActionContext).toHaveBeenCalledWith("/register");
    expect(mocks.tx.registration.create).toHaveBeenCalledWith({
      data: {
        orgId: org.id, eventId, portalAccountId: account.id, attendeeProfileId, typeId,
        status: "PENDING", approvalStatus: "APPROVED", addOns: { create: [] }
      }
    });
    expect(mocks.queueWebhookEvent).toHaveBeenCalledExactlyOnceWith({
      orgId: org.id,
      eventId,
      type: "registration.created",
      data: { registrationId: "registration-one", userId: account.id, attendeeProfileId, typeId, status: "PENDING" }
    });
    expect(mocks.queueWebhookEvent.mock.calls[0]?.[0].data).not.toHaveProperty("portalAccountId");
    expect(mocks.markOrderPaid).toHaveBeenCalledWith("order-one");
  });

  it("requires an attendee profile", async () => {
    const form = registrationForm();
    form.delete("attendeeProfileId");
    await expect(createRegistration({}, form)).resolves.toEqual({ error: "Choose who will attend." });
    expect(mocks.tx.registration.create).not.toHaveBeenCalled();
  });

  it("passes the selected profile to the capacity check and stores it on the registration", async () => {
    await createRegistration({}, registrationForm());
    expect(mocks.tx.attendeeProfile.findUnique).toHaveBeenCalledWith({
      where: { id: attendeeProfileId, orgId: org.id, portalAccountId: account.id },
      select: { id: true, orgId: true, portalAccountId: true }
    });
    expect(mocks.tx.registration.create).toHaveBeenCalledWith({ data: expect.objectContaining({ attendeeProfileId }) });
  });

  it("no longer renames the portal account", async () => {
    await createRegistration({}, registrationForm());
    expect(mocks.syncPortalAccountName).not.toHaveBeenCalled();
  });

  it("cart metadata names the attendee profile", async () => {
    await expect(createRegistration({}, registrationForm("cart"))).resolves.toEqual({ redirectTo: "/store" });
    const input = mocks.prisma.cart.upsert.mock.calls[0][0];
    for (const path of [input.create, input.update]) {
      expect(path.items.create[0].metadata).toEqual({ attendeeName: profile.fullName, attendeeEmail: account.email, registrationType: "Free" });
    }
  });

  it("rejects a foreign or missing profile with the same inline message", async () => {
    mocks.prisma.attendeeProfile.findFirst.mockResolvedValue(null);
    await expect(createRegistration({}, registrationForm())).resolves.toEqual({ error: "That attendee is not available." });
    expect(mocks.prisma.attendeeProfile.findFirst).toHaveBeenCalledWith({ where: { id: attendeeProfileId, orgId: org.id, portalAccountId: account.id } });
    expect(mocks.tx.registration.create).not.toHaveBeenCalled();
  });

  it.each([
    [false, "Add an emergency contact."],
    [true, "Diet is required."]
  ])("rejects missing required contacts or answers inline before any write (%s)", async (withContact, error) => {
    configureDetails();
    const form = registrationForm();
    if (withContact) addContact(form);
    await expect(createRegistration({}, form)).resolves.toEqual({ error });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.registration.create).not.toHaveBeenCalled();
    expect(mocks.tx.attendeeProfile.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.registrationAgreement.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.cart.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.order.create).not.toHaveBeenCalled();
  });

  it("stores answers and writes one ATTENDEE agreement per current policy", async () => {
    configureDetails();
    mocks.tx.policyDocument.findMany.mockResolvedValue(policies);
    const form = addContact(registrationForm());
    form.set("field-diet", "Vegetarian");
    form.set("shownPolicyVersions", "version-one,version-two");
    form.set("agreement-policy-one", "version-one");
    form.set("agreement-policy-two", "version-two");
    await expect(createRegistration({}, form)).resolves.toHaveProperty("redirectTo");
    expect(mocks.tx.registration.create).toHaveBeenCalledWith({ data: expect.objectContaining({ formResponses: { diet: "Vegetarian" } }) });
    expect(mocks.tx.registrationAgreement.createMany).toHaveBeenCalledExactlyOnceWith({ data: policies.map((policy) => ({
      orgId: org.id, eventId, registrationId: "registration-one", documentId: policy.id,
      documentVersionId: policy.versions[0].id, source: "ATTENDEE", portalAccountId: account.id
    })) });
    expect(mocks.tx.policyDocument.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: org.id, eventId, archivedAt: null } }));
    expect(mocks.queueWebhookEvent.mock.calls[0][0].data).not.toHaveProperty("formResponses");
  });

  it.each(["stripe", "cart"])("returns policiesChanged for a stale submission and creates nothing (%s)", async (mode) => {
    mocks.tx.policyDocument.findMany.mockResolvedValue(policies);
    const form = registrationForm(mode);
    form.set("shownPolicyVersions", "old-version,version-two");
    form.set("agreement-policy-one", "old-version");
    form.set("agreement-policy-two", "version-two");
    await expect(createRegistration({}, form)).resolves.toEqual({
      error: "This policy was updated; please review it again.", policiesChanged: true
    });
    expect(mocks.tx.registration.create).not.toHaveBeenCalled();
    expect(mocks.prisma.cart.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.order.create).not.toHaveBeenCalled();
    expect(mocks.tx.attendeeProfile.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.registrationAgreement.createMany).not.toHaveBeenCalled();
    expect(mocks.queueWebhookEvent).not.toHaveBeenCalled();
  });

  it.each([false, true])("updates the profile's contacts only when they changed (%s)", async (changed) => {
    configureDetails();
    mocks.prisma.attendeeProfile.findFirst.mockResolvedValue({ ...profile, emergencyContacts: changed ? [] : [contact] });
    mocks.tx.attendeeProfile.findUnique.mockResolvedValue({ ...profile, emergencyContacts: changed ? [] : [contact] });
    const form = addContact(registrationForm());
    form.set("field-diet", "None");
    await createRegistration({}, form);
    if (changed) {
      expect(mocks.tx.attendeeProfile.updateMany).toHaveBeenCalledExactlyOnceWith({
        where: { id: attendeeProfileId, orgId: org.id, portalAccountId: account.id },
        data: { emergencyContacts: [contact] }
      });
    } else expect(mocks.tx.attendeeProfile.updateMany).not.toHaveBeenCalled();
  });

  it("keeps stored contacts beyond the event's count", async () => {
    configureDetails();
    mocks.prisma.attendeeProfile.findFirst.mockResolvedValue({ ...profile, emergencyContacts: [otherContact, otherContact] });
    mocks.tx.attendeeProfile.findUnique.mockResolvedValue({ ...profile, emergencyContacts: [otherContact, otherContact] });
    const form = addContact(registrationForm());
    form.set("field-diet", "None");
    await createRegistration({}, form);
    expect(mocks.tx.attendeeProfile.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: attendeeProfileId, orgId: org.id, portalAccountId: account.id },
      data: { emergencyContacts: [contact, otherContact] }
    });
  });

  it("preserves a second contact updated after the outer profile read", async () => {
    configureDetails();
    const newerContact = { ...otherContact, name: "Updated guardian" };
    mocks.prisma.attendeeProfile.findFirst.mockResolvedValue({ ...profile, emergencyContacts: [otherContact, otherContact] });
    mocks.tx.attendeeProfile.findUnique.mockResolvedValue({ ...profile, emergencyContacts: [otherContact, newerContact] });
    const form = addContact(registrationForm());
    form.set("field-diet", "None");

    await createRegistration({}, form);

    expect(mocks.tx.attendeeProfile.findUnique).toHaveBeenCalledWith({
      where: { id: attendeeProfileId, orgId: org.id, portalAccountId: account.id },
      select: { emergencyContacts: true }
    });
    expect(mocks.tx.attendeeProfile.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: attendeeProfileId, orgId: org.id, portalAccountId: account.id },
      data: { emergencyContacts: [contact, newerContact] }
    });
  });

  it("reads contacts again when a P2034 conflict retries the transaction callback", async () => {
    configureDetails();
    const newerContact = { ...otherContact, name: "Updated while retrying" };
    let storedContacts = [otherContact, otherContact];
    mocks.prisma.attendeeProfile.findFirst.mockResolvedValue({ ...profile, emergencyContacts: storedContacts });
    mocks.tx.attendeeProfile.findUnique.mockImplementation(async () => ({ ...profile, emergencyContacts: storedContacts }));
    mocks.prisma.$transaction.mockImplementationOnce(async (callback) => {
      await callback(mocks.tx);
      storedContacts = [otherContact, newerContact];
      throw new mocks.SerializationConflict("Write conflict");
    });
    const form = addContact(registrationForm());
    form.set("field-diet", "None");

    await expect(createRegistration({}, form)).resolves.toEqual({ redirectTo: "/register?success=registration-one" });

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.attendeeProfile.findFirst).toHaveBeenCalledOnce();
    const contactReads = mocks.tx.attendeeProfile.findUnique.mock.calls.filter(([input]) => input.select.emergencyContacts);
    expect(contactReads).toHaveLength(2);
    expect(mocks.tx.attendeeProfile.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: attendeeProfileId, orgId: org.id, portalAccountId: account.id },
      data: { emergencyContacts: [contact, otherContact] }
    });
    expect(mocks.tx.attendeeProfile.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: attendeeProfileId, orgId: org.id, portalAccountId: account.id },
      data: { emergencyContacts: [contact, newerContact] }
    });
    expect(mocks.queueWebhookEvent).toHaveBeenCalledOnce();
    expect(mocks.prisma.order.create).toHaveBeenCalledOnce();
  });

  it("returns policiesChanged when the registration form changed after it was shown", async () => {
    const form = registrationForm();
    form.set("registrationFormVersion", "stale-version");
    await expect(createRegistration({}, form)).resolves.toEqual({
      error: "The registration form was updated; please review it again.", policiesChanged: true
    });
    expect(mocks.tx.registration.create).not.toHaveBeenCalled();
    expect(mocks.prisma.order.create).not.toHaveBeenCalled();
  });

  it("accepts the fingerprint of the form that is still current", async () => {
    const form = registrationForm();
    form.set("registrationFormVersion", registrationFormFingerprint(getRegistrationForm({})));
    await expect(createRegistration({}, form)).resolves.toEqual({ redirectTo: "/register?success=registration-one" });
  });

  it("an unconfigured event without policies behaves as before", async () => {
    const form = addContact(registrationForm());
    form.set("field-diet", "Ignored");
    await expect(createRegistration({}, form)).resolves.toEqual({ redirectTo: "/register?success=registration-one" });
    expect(mocks.tx.attendeeProfile.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.attendeeProfile.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { id: attendeeProfileId, orgId: org.id, portalAccountId: account.id },
      select: { id: true, orgId: true, portalAccountId: true }
    });
    expect(mocks.tx.registrationAgreement.createMany).not.toHaveBeenCalled();
    expect(mocks.tx.registration.create.mock.calls[0][0].data).not.toHaveProperty("formResponses");
  });
});
