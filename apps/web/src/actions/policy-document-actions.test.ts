import type * as DashboardAccess from "@/lib/dashboard-access";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    policyDocument: { aggregate: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    policyDocumentVersion: { findFirst: vi.fn(), create: vi.fn() },
    orgMember: { findUnique: vi.fn() },
    $transaction: vi.fn(), $queryRaw: vi.fn()
  },
  requireEventAccess: vi.fn(), requirePolicyDocumentAccess: vi.fn(), revalidatePath: vi.fn(), revalidatePublicRegistration: vi.fn(),
  auth: vi.fn(), requireStaffAssurance: vi.fn(), redirect: vi.fn()
}));

vi.mock("@vfurst/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/dashboard-access", () => ({
  requireEventAccess: mocks.requireEventAccess, requirePolicyDocumentAccess: mocks.requirePolicyDocumentAccess
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/staff-verification", () => ({ requireStaffAssurance: mocks.requireStaffAssurance }));
vi.mock("@/lib/rate-limit", () => ({ RateLimitExceededError: class extends Error {} }));
vi.mock("@/lib/organization-lifecycle", () => ({ OrganizationLifecycleError: class extends Error {} }));
vi.mock("@vfurst/auth/invitations", () => ({ OrganizationInvitationError: class extends Error {} }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/public-registration", () => ({ revalidatePublicRegistration: mocks.revalidatePublicRegistration }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, unstable_rethrow: vi.fn(), notFound: vi.fn() }));

import { archivePolicyDocument, createPolicyDocument, movePolicyDocument, publishPolicyVersion, restorePolicyDocument } from "./policy-document-actions";

const eventId = "00000000-0000-4000-8000-000000000001";
const documentId = "00000000-0000-4000-8000-000000000002";
const event = { id: eventId, orgId: "org-a" };
const document = { id: documentId, orgId: event.orgId, eventId, sortOrder: 4, archivedAt: null };
const latest = { version: 3, title: "Conduct", body: "Be kind." };

function form(values: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({ eventId, documentId, title: " Conduct ", body: "Be kind.\r\nPlease.", ...values })
    .forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("policy document actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireEventAccess.mockResolvedValue({ userId: "publisher", event });
    mocks.requirePolicyDocumentAccess.mockResolvedValue({ userId: "publisher", document, event });
    mocks.prisma.$transaction.mockImplementation(async (operation) => operation(mocks.prisma));
    mocks.prisma.policyDocument.aggregate.mockResolvedValue({ _max: { sortOrder: 7 } });
    mocks.prisma.policyDocument.create.mockResolvedValue(document);
    mocks.prisma.policyDocumentVersion.findFirst.mockResolvedValue(latest);
    mocks.prisma.policyDocumentVersion.create.mockImplementation(async ({ data }) => data);
  });

  it("creates a document with version 1 and the next sort order", async () => {
    await createPolicyDocument({}, form());
    expect(mocks.requireEventAccess).toHaveBeenCalledWith(eventId);
    expect(mocks.prisma.policyDocument.aggregate).toHaveBeenCalledWith({ where: { orgId: "org-a", eventId }, _max: { sortOrder: true } });
    expect(mocks.prisma.policyDocument.create).toHaveBeenCalledWith({ data: { orgId: "org-a", eventId, sortOrder: 8 } });
    expect(mocks.prisma.policyDocumentVersion.create).toHaveBeenCalledWith({ data: {
      orgId: "org-a", documentId, version: 1, title: "Conduct", body: "Be kind.\nPlease.", publishedByUserId: "publisher"
    } });
    expect(mocks.redirect).toHaveBeenCalledWith(`/dashboard/events/${eventId}/settings/policies/${documentId}?published=1`);
  });

  it("locks the owning event before reading the maximum or moving documents", async () => {
    mocks.prisma.policyDocument.findMany.mockResolvedValue([document]);
    await createPolicyDocument({}, form());
    await movePolicyDocument({}, form({ direction: "up" }));
    for (const call of mocks.prisma.$queryRaw.mock.calls) {
      expect(call[0].join("")).toMatch(/SELECT id FROM events.*FOR UPDATE/);
      expect(call.slice(1)).toEqual([eventId, "org-a"]);
    }
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.prisma.policyDocument.aggregate.mock.invocationCallOrder[0]!);
    expect(mocks.prisma.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(mocks.prisma.policyDocument.findMany.mock.invocationCallOrder[0]!);
  });

  it("concurrent creates retain distinct ranks and remain movable", async () => {
    // Stateful PostgreSQL double: each statement yields and the event row lock
    // lasts until commit. Without it, concurrent aggregates observe the same max.
    const rows: Array<{ id: string; sortOrder: number }> = [];
    let lockTail = Promise.resolve();
    mocks.prisma.$transaction.mockImplementation(async (operation) => {
      let release: (() => void) | undefined;
      try {
        return await operation({
          ...mocks.prisma,
          $queryRaw: async () => {
            const prior = lockTail;
            lockTail = new Promise<void>((resolve) => { release = resolve; });
            await prior;
            return [{ id: eventId }];
          }
        });
      } finally {
        release?.();
      }
    });
    mocks.prisma.policyDocument.aggregate.mockImplementation(async () => {
      const maximum = rows.length ? Math.max(...rows.map((row) => row.sortOrder)) : 7;
      await Promise.resolve();
      return { _max: { sortOrder: maximum } };
    });
    mocks.prisma.policyDocument.create.mockImplementation(async ({ data }) => {
      const row = { id: `document-${rows.length}`, sortOrder: data.sortOrder };
      rows.push(row);
      return row;
    });
    mocks.prisma.policyDocument.findMany.mockImplementation(async () => rows
      .map((row) => ({ ...row })).sort((left, right) => left.sortOrder - right.sortOrder));
    mocks.prisma.policyDocument.update.mockImplementation(async ({ where, data }) => {
      const row = rows.find((item) => item.id === where.id)!;
      Object.assign(row, data);
      return row;
    });

    await Promise.all([createPolicyDocument({}, form()), createPolicyDocument({}, form()), createPolicyDocument({}, form())]);
    expect(rows.map((row) => row.sortOrder)).toEqual([8, 9, 10]);
    mocks.requirePolicyDocumentAccess.mockResolvedValue({ userId: "publisher", document: { ...document, id: rows[1]!.id }, event });
    await movePolicyDocument({}, form({ direction: "up" }));
    expect([...rows].sort((left, right) => left.sortOrder - right.sortOrder).map((row) => row.id))
      .toEqual(["document-1", "document-0", "document-2"]);
  });

  it.each([{ title: "New conduct", body: latest.body }, { title: latest.title, body: "Updated text" }])(
    "publishes version n+1 only when title or body changed: %j", async (values) => {
      await publishPolicyVersion({}, form({ ...values, eventId: "unrelated-event" }));
      expect(mocks.requirePolicyDocumentAccess).toHaveBeenCalledWith(documentId);
      expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
      expect(mocks.prisma.policyDocumentVersion.create).toHaveBeenCalledWith({ data: {
        ...values, orgId: "org-a", documentId, version: 4, publishedByUserId: "publisher"
      } });
      expect(mocks.redirect).toHaveBeenCalledWith(`/dashboard/events/${eventId}/settings/policies/${documentId}?published=4`);
    }
  );

  it("returns Nothing to publish. when normalized title and body are unchanged", async () => {
    await expect(publishPolicyVersion({}, form({ title: ` ${latest.title} `, body: latest.body })))
      .resolves.toEqual({ error: "Nothing to publish." });
    expect(mocks.prisma.policyDocumentVersion.create).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(["P2002", "P2034"])("maps a concurrent publish to the reload message (%s)", async (code) => {
    mocks.prisma.$transaction.mockRejectedValue({ code });
    await expect(publishPolicyVersion({}, form())).resolves.toEqual({ error: "Another version was just published. Reload the page and try again." });
  });

  it("archive sets archivedAt; restore clears it", async () => {
    await archivePolicyDocument({}, form());
    expect(mocks.prisma.policyDocument.update).toHaveBeenLastCalledWith({ where: { id: documentId }, data: { archivedAt: expect.any(Date) } });
    await restorePolicyDocument({}, form());
    expect(mocks.prisma.policyDocument.update).toHaveBeenLastCalledWith({ where: { id: documentId }, data: { archivedAt: null } });
    expect(mocks.prisma.policyDocumentVersion.create).not.toHaveBeenCalled();
  });

  it.each(["up", "down"])("move swaps with the non-archived neighbor (%s)", async (direction) => {
    mocks.prisma.policyDocument.findMany.mockResolvedValue([
      { id: "before", sortOrder: 2 }, document, { id: "after", sortOrder: 8 }
    ]);
    await movePolicyDocument({}, form({ direction }));
    expect(mocks.prisma.policyDocument.findMany).toHaveBeenCalledWith({
      where: { orgId: "org-a", eventId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, sortOrder: true }
    });
    const neighbor = direction === "up" ? { id: "before", sortOrder: 2 } : { id: "after", sortOrder: 8 };
    expect(mocks.prisma.policyDocument.update).toHaveBeenCalledWith({ where: { id: documentId }, data: { sortOrder: neighbor.sortOrder } });
    expect(mocks.prisma.policyDocument.update).toHaveBeenCalledWith({ where: { id: neighbor.id }, data: { sortOrder: 4 } });
  });

  it.each(["up", "down"])("move ignores the ends (%s)", async (direction) => {
    mocks.prisma.policyDocument.findMany.mockResolvedValue([document]);
    await movePolicyDocument({}, form({ direction }));
    expect(mocks.prisma.policyDocument.update).not.toHaveBeenCalled();
  });

  it("every published change refreshes the public registration page; a no-op publish does not", async () => {
    mocks.prisma.policyDocument.findMany.mockResolvedValue([document]);
    await createPolicyDocument({}, form());
    await publishPolicyVersion({}, form({ title: "New conduct" }));
    await archivePolicyDocument({}, form());
    await restorePolicyDocument({}, form());
    await movePolicyDocument({}, form({ direction: "up" }));
    expect(mocks.revalidatePublicRegistration).toHaveBeenCalledTimes(5);
    mocks.revalidatePublicRegistration.mockClear();
    await expect(publishPolicyVersion({}, form({ title: latest.title, body: latest.body }))).resolves.toEqual({ error: "Nothing to publish." });
    expect(mocks.revalidatePublicRegistration).not.toHaveBeenCalled();
  });

  it("returns title validation inline before writing", async () => {
    await expect(createPolicyDocument({}, form({ title: "" }))).resolves.toEqual({ error: "Enter a title." });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("a foreign document id is thrown by the access helper and not caught by the action", async () => {
    const failure = new Error("Policy document not found.");
    mocks.requirePolicyDocumentAccess.mockRejectedValue(failure);
    await expect(publishPolicyVersion({}, form())).rejects.toBe(failure);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("requirePolicyDocumentAccess", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "publisher" } });
    mocks.prisma.policyDocument.findUnique.mockResolvedValue({ ...document, event });
    mocks.prisma.orgMember.findUnique.mockResolvedValue({ role: "ADMIN", org: { status: "ACTIVE" } });
  });

  it.each([null, { ...document, orgId: "foreign-org", event }, { ...document, eventId: "foreign-event", event }])(
    "throws for missing or inconsistent tenant documents", async (value) => {
      mocks.prisma.policyDocument.findUnique.mockResolvedValue(value);
      const { requirePolicyDocumentAccess } = await vi.importActual<typeof DashboardAccess>("@/lib/dashboard-access");
      await expect(requirePolicyDocumentAccess(documentId)).rejects.toThrow("Policy document not found.");
      expect(mocks.prisma.orgMember.findUnique).not.toHaveBeenCalled();
    }
  );

  it("requires membership in the stored event organization and mutation assurance", async () => {
    const { requirePolicyDocumentAccess } = await vi.importActual<typeof DashboardAccess>("@/lib/dashboard-access");
    await expect(requirePolicyDocumentAccess(documentId)).resolves.toMatchObject({ userId: "publisher", document, event });
    expect(mocks.prisma.orgMember.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId_orgId: { userId: "publisher", orgId: "org-a" } } }));
    expect(mocks.requireStaffAssurance).toHaveBeenCalledExactlyOnceWith();
  });

  it.each([null, { role: "MEMBER", org: { status: "ACTIVE" } }, { role: "OWNER", org: { status: "SUSPENDED" } }])(
    "denies an unauthorized membership", async (membership) => {
      mocks.prisma.orgMember.findUnique.mockResolvedValue(membership);
      const { requirePolicyDocumentAccess } = await vi.importActual<typeof DashboardAccess>("@/lib/dashboard-access");
      await expect(requirePolicyDocumentAccess(documentId)).rejects.toThrow("You do not have permission to manage this policy.");
      expect(mocks.requireStaffAssurance).not.toHaveBeenCalled();
    }
  );
});
