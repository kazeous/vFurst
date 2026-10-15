import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    event: { findUnique: vi.fn() },
    registrationType: { findUnique: vi.fn() },
    registration: { count: vi.fn(), create: vi.fn() }
  };
  return {
    tx,
    prisma: {
      event: { findFirst: vi.fn() },
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

describe("registration.created webhook contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPortalActionContext.mockResolvedValue({ org, account });
    mocks.syncPortalAccountName.mockResolvedValue(account);
    mocks.prisma.event.findFirst.mockResolvedValue({
      id: eventId, orgId: org.id, org, currency: "USD", settings: {},
      registrationTypes: [{ id: typeId, name: "Free", price: 0, scheduledPricing: [], addOns: [] }]
    });
    mocks.tx.event.findUnique.mockResolvedValue({ id: eventId, orgId: org.id, settings: {} });
    mocks.tx.registrationType.findUnique.mockResolvedValue({ id: typeId, eventId, orgId: org.id, maxCapacity: null });
    mocks.tx.registration.count.mockResolvedValue(0);
    mocks.tx.registration.create.mockResolvedValue({ id: "registration-one", status: "PENDING" });
    mocks.prisma.order.create.mockResolvedValue({ id: "order-one" });
  });

  it("creates a portal-owned registration and queues its owner as the external userId", async () => {
    const form = new FormData();
    form.set("eventId", eventId);
    form.set("typeId", typeId);
    form.set("attendeeName", account.name);
    form.set("attendeeEmail", account.email);

    await expect(createRegistration({}, form)).resolves.toEqual({ redirectTo: "/register?success=registration-one" });

    expect(mocks.getPortalActionContext).toHaveBeenCalledWith("/register");
    expect(mocks.tx.registration.create).toHaveBeenCalledWith({
      data: {
        orgId: org.id, eventId, portalAccountId: account.id, typeId,
        status: "PENDING", approvalStatus: "APPROVED", addOns: { create: [] }
      }
    });
    expect(mocks.queueWebhookEvent).toHaveBeenCalledExactlyOnceWith({
      orgId: org.id,
      eventId,
      type: "registration.created",
      data: { registrationId: "registration-one", userId: account.id, typeId, status: "PENDING" }
    });
    expect(mocks.queueWebhookEvent.mock.calls[0]?.[0].data).not.toHaveProperty("portalAccountId");
    expect(mocks.markOrderPaid).toHaveBeenCalledWith("order-one");
  });
});
