import { describe, expect, it, vi } from "vitest";
import { prepareRegistrationAgreements } from "./prepare-registration-agreements.mjs";

describe("registration agreement schema preparation", () => {
  it("skips safely before the events and registrations tables exist", async () => {
    const client = {
      $queryRaw: vi.fn(async () => [{ eventsTable: null, registrationsTable: null }]),
      $executeRaw: vi.fn()
    };

    await expect(prepareRegistrationAgreements(client)).resolves.toEqual({
      skipped: true,
      reason: "Event tables do not exist yet; Prisma will create the current schema."
    });
    expect(client.$executeRaw).not.toHaveBeenCalled();
  });

  it("creates both composite unique indexes before Prisma sync", async () => {
    const statements = [];
    const client = {
      $queryRaw: vi.fn(async () => [{ eventsTable: "events", registrationsTable: "registrations" }]),
      $executeRaw: vi.fn(async (strings) => {
        statements.push(strings.join("?").replace(/\s+/g, " ").trim());
        return 0;
      })
    };

    await expect(prepareRegistrationAgreements(client)).resolves.toEqual({ skipped: false });
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "events_orgId_id_key" ON "events" ("orgId", "id")');
    expect(statements[1]).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "registrations_orgId_eventId_id_key" ON "registrations" ("orgId", "eventId", "id")');
  });
});
