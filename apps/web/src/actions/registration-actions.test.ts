import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    event: { findUnique: vi.fn() },
    registrationType: { findUnique: vi.fn() },
    attendeeProfile: { findUnique: vi.fn() },
    registration: { count: vi.fn(), create: vi.fn() }
  };
  return {
    tx,
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
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {}
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

const org = { id: "org-one", status: "ACTIVE" };
const account = { id: "portal-account-one", orgId: org.id, name: "Attendee", email: "attendee@example.com" };
const eventId = "00000000-0000-4000-8000-000000000001";
const typeId = "00000000-0000-4000-8000-000000000002";
const attendeeProfileId = "00000000-0000-4000-8000-000000000003";
const profile = { id: attendeeProfileId, orgId: org.id, portalAccountId: account.id, fullName: "Child Attendee" };

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
    mocks.prisma.event.findFirst.mockResolvedValue({
      id: eventId, orgId: org.id, org, currency: "USD", settings: {},
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
});
