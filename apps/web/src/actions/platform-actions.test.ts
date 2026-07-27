import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const organization = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn()
  };
  const tx = { organization };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    organization
  };

  return {
    tx,
    prisma,
    enqueueTenantControlPlaneEvent: vi.fn(),
    requirePlatformAdmin: vi.fn(),
    revalidatePath: vi.fn()
  };
});

vi.mock("@vfurst/db", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {},
    TransactionIsolationLevel: { Serializable: "Serializable" }
  },
  prisma: mocks.prisma,
  enqueueTenantControlPlaneEvent: mocks.enqueueTenantControlPlaneEvent
}));
vi.mock("@/lib/dashboard-access", () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }));
vi.mock("@/lib/custom-domain", () => ({
  isCustomDomainVerified: vi.fn(),
  normalizeCustomDomain: (value: string) => value.trim().toLowerCase()
}));
vi.mock("@/lib/organization-invitation-email", () => ({ deliverOrganizationInvitation: vi.fn() }));
vi.mock("@/lib/organization-invitations", () => ({
  issueOrganizationInvitation: vi.fn(),
  revokeOrganizationInvitation: vi.fn()
}));
vi.mock("@/lib/platform-hosts", () => ({ isPlatformDomain: () => false }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { activateOrganizationCustomDomain, changeOrganizationStatus } from "./platform-actions";

const orgId = "00000000-0000-4000-8000-000000000001";
const adminId = "00000000-0000-4000-8000-000000000002";

function lifecycleForm(targetStatus: string) {
  const form = new FormData();
  form.set("orgId", orgId);
  form.set("targetStatus", targetStatus);
  return form;
}

function organizationForm() {
  const form = new FormData();
  form.set("orgId", orgId);
  return form;
}

describe("platform control-plane mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePlatformAdmin.mockResolvedValue({ id: adminId });
    mocks.prisma.$transaction.mockImplementation(async (callback: (client: typeof mocks.tx) => unknown) =>
      callback(mocks.tx)
    );
    mocks.tx.organization.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.organization.findFirst.mockResolvedValue(null);
    mocks.enqueueTenantControlPlaneEvent.mockResolvedValue({});
  });

  it("writes the lifecycle event in the same serializable callback with the canonical payload", async () => {
    mocks.tx.organization.findUnique.mockResolvedValue({
      id: orgId,
      slug: "acme",
      status: "ACTIVE",
      _count: { members: 1 }
    });

    await changeOrganizationStatus({}, lifecycleForm("SUSPENDED"));

    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable"
    });
    expect(mocks.enqueueTenantControlPlaneEvent).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        organizationId: orgId,
        eventType: "tenant.lifecycle-changed",
        actorUserId: adminId,
        data: {
          previousStatus: "ACTIVE",
          status: "SUSPENDED"
        }
      })
    );
    const event = mocks.enqueueTenantControlPlaneEvent.mock.calls[0]?.[1];
    expect(event.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(event.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(event.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(mocks.tx.organization.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.enqueueTenantControlPlaneEvent.mock.invocationCallOrder[0] ?? Infinity
    );
  });

  it("rejects an invalid lifecycle transition before mutation or outbox insertion", async () => {
    mocks.tx.organization.findUnique.mockResolvedValue({
      id: orgId,
      slug: "acme",
      status: "ACTIVE",
      _count: { members: 1 }
    });

    await expect(changeOrganizationStatus({}, lifecycleForm("PROVISIONING"))).resolves.toEqual({
      error: "Organization cannot move from Active to Provisioning."
    });

    expect(mocks.tx.organization.updateMany).not.toHaveBeenCalled();
    expect(mocks.enqueueTenantControlPlaneEvent).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("propagates an outbox failure through the transaction boundary before revalidation", async () => {
    mocks.tx.organization.findUnique.mockResolvedValue({
      id: orgId,
      slug: "acme",
      status: "ACTIVE",
      _count: { members: 1 }
    });
    mocks.enqueueTenantControlPlaneEvent.mockRejectedValue(new Error("outbox unavailable"));

    await expect(changeOrganizationStatus({}, lifecycleForm("SUSPENDED"))).rejects.toThrow("outbox unavailable");

    expect(mocks.tx.organization.updateMany).toHaveBeenCalledOnce();
    expect(mocks.enqueueTenantControlPlaneEvent).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("includes the active and previous custom domains in the tenant event", async () => {
    mocks.tx.organization.findUnique.mockResolvedValue({
      id: orgId,
      slug: "acme",
      status: "ACTIVE",
      customDomain: "old.example.test",
      requestedCustomDomain: "events.example.test",
      customDomainStatus: "VERIFIED",
      customDomainVerifiedAt: new Date(),
      customDomainVerifiedById: adminId
    });

    await activateOrganizationCustomDomain({}, organizationForm());

    expect(mocks.enqueueTenantControlPlaneEvent).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        organizationId: orgId,
        eventType: "tenant.domain-activated",
        actorUserId: adminId,
        data: {
          hostname: "events.example.test",
          previousHostname: "old.example.test"
        }
      })
    );
  });
});
