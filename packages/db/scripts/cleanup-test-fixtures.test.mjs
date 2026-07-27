import { describe, expect, it, vi } from "vitest";
import {
  cleanupTestFixtures,
  isFixtureOrganizationSlug,
  isFixtureUserEmail
} from "./cleanup-test-fixtures.mjs";

describe("test fixture cleanup policy", () => {
  it.each([
    "load-1720000000000",
    "load-full-1720000000000",
    "phase1-smoke-1720000000000",
    "phase-7-smoke-1720000000000",
    "resource-org-a-1720000000000",
    "staff-vendor-org-b-1720000000000"
  ])("matches the documented fixture organization prefix %s", (slug) => {
    expect(isFixtureOrganizationSlug(slug)).toBe(true);
  });

  it.each([
    "production-convention",
    "upload-assets",
    "org-a-without-a-prefix",
    "phase1-smoke",
    "load"
  ])("does not broaden cleanup to organization slug %s", (slug) => {
    expect(isFixtureOrganizationSlug(slug)).toBe(false);
  });

  it.each([
    "load-admin-1720000000000@example.com",
    "load-admin-load-full-1720000000000@example.com",
    "attendee-1@load-1720000000000.example.com"
  ])("matches a load-only synthetic user email %s", (email) => {
    expect(isFixtureUserEmail(email)).toBe(true);
  });

  it.each([
    "owner@example.com",
    "load-admin@example.com",
    "attendee@load.example.com",
    "attendee@load-1720000000000.example.org"
  ])("preserves non-load email %s", (email) => {
    expect(isFixtureUserEmail(email)).toBe(false);
  });

  it("deletes only matched organizations, their detached outbox rows, and synthetic linked users", async () => {
    const fixtureOrgId = "00000000-0000-4000-8000-000000000101";
    const eventId = "00000000-0000-4000-8000-000000000102";
    const loadUser = {
      id: "00000000-0000-4000-8000-000000000103",
      email: "attendee-1@load-1720000000000.example.com"
    };
    const linkedUser = {
      id: "00000000-0000-4000-8000-000000000104",
      email: "resource-owner-a-1720000000000@example.com"
    };
    const tx = {
      organization: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      controlPlaneOutboxEvent: {
        count: vi.fn().mockResolvedValue(1),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      user: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) }
    };
    const client = {
      organization: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: fixtureOrgId,
            slug: "resource-org-a-1720000000000",
            controlPlaneOutboxEvents: [{ id: eventId }]
          },
          {
            id: "00000000-0000-4000-8000-000000000105",
            slug: "real-convention",
            controlPlaneOutboxEvents: []
          }
        ])
      },
      user: {
        findMany: vi.fn().mockResolvedValueOnce([loadUser]).mockResolvedValueOnce([linkedUser])
      },
      $transaction: vi.fn(async (operation) => operation(tx))
    };

    await expect(cleanupTestFixtures(client, { apply: true })).resolves.toEqual({
      applied: true,
      matched: {
        organizations: 1,
        users: 2,
        outboxEvents: 1,
        slugs: ["resource-org-a-1720000000000"]
      },
      deleted: { organizations: 1, users: 2, outboxEvents: 1 }
    });
    expect(tx.organization.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [fixtureOrgId] } } });
    expect(tx.controlPlaneOutboxEvent.count).toHaveBeenCalledWith({
      where: { id: { in: [eventId] }, organizationId: null }
    });
    expect(tx.user.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [loadUser.id, linkedUser.id] } }
    });
  });
});
