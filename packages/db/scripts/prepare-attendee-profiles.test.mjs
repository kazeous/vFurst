import { describe, expect, it, vi } from "vitest";
import { prepareAttendeeProfiles } from "./prepare-attendee-profiles.mjs";

function mockClient(registrations = [], accounts = [], existingSelfProfiles = []) {
  const statements = [];
  const client = {
    $queryRaw: vi.fn()
      .mockResolvedValueOnce([{ registrationsTable: "registrations" }])
      .mockResolvedValueOnce(registrations)
      .mockResolvedValueOnce(accounts)
      .mockResolvedValueOnce(existingSelfProfiles),
    $executeRaw: vi.fn(async (strings) => { statements.push(strings.join("?")); return 1; }),
    $transaction: vi.fn(async (fn) => fn(client))
  };
  return { client, statements };
}

describe("attendee-profile schema preparation", () => {
  it("skips safely before a greenfield database has registrations", async () => {
    const client = { $queryRaw: vi.fn(async () => [{ registrationsTable: null }]), $executeRaw: vi.fn() };
    await expect(prepareAttendeeProfiles(client)).resolves.toEqual({
      skipped: true,
      reason: "Registration tables do not exist yet; Prisma will create the current schema."
    });
    expect(client.$executeRaw).not.toHaveBeenCalled();
  });

  it("creates the table, indexes and nullable column before backfilling", async () => {
    const { client, statements } = mockClient([
      { id: "r1", portalAccountId: "a1", eventId: "e1", status: "CONFIRMED", createdAt: new Date("2026-01-01") },
      { id: "r2", portalAccountId: "a1", eventId: "e1", status: "PENDING", createdAt: new Date("2026-01-02") }
    ], [{ id: "a1", orgId: "o1", name: "Mai Le", email: "mai@example.com" }]);
    await expect(prepareAttendeeProfiles(client)).resolves.toEqual({ skipped: false, profilesCreated: 2, registrationsAssigned: 2 });
    [
      'CREATE TABLE IF NOT EXISTS "attendee_profiles"',
      'CREATE UNIQUE INDEX IF NOT EXISTS "attendee_profiles_accountHolderOf_key"',
      'CREATE UNIQUE INDEX IF NOT EXISTS "attendee_profiles_orgId_id_key"',
      'CREATE UNIQUE INDEX IF NOT EXISTS "attendee_profiles_orgId_portalAccountId_id_key"',
      'CREATE INDEX IF NOT EXISTS "attendee_profiles_orgId_idx"',
      'CREATE INDEX IF NOT EXISTS "attendee_profiles_portalAccountId_idx"',
      'ADD COLUMN IF NOT EXISTS "attendeeProfileId"'
    ].forEach((fragment, index) => expect(statements[index]).toContain(fragment));
    expect(statements.slice(7, 9).every((sql) => sql.includes('INSERT INTO "attendee_profiles"'))).toBe(true);
    expect(statements.slice(9).every((sql) => sql.includes('UPDATE "registrations"') && sql.includes('"attendeeProfileId" IS NULL'))).toBe(true);
    expect(client.$transaction).toHaveBeenCalledOnce();
    const inserts = client.$executeRaw.mock.calls.slice(7, 9);
    expect(inserts[0].slice(2)).toEqual(["o1", "a1", "a1", "Mai Le"]);
    expect(inserts[1].slice(2)).toEqual(["o1", "a1", null, "Mai Le (2)"]);
  });

  it("is a no-op when no registration lacks a profile", async () => {
    const { client, statements } = mockClient();
    await expect(prepareAttendeeProfiles(client)).resolves.toEqual({ skipped: false, profilesCreated: 0, registrationsAssigned: 0 });
    expect(statements).toHaveLength(7);
    expect(statements.some((sql) => /\b(INSERT|UPDATE)\b/.test(sql))).toBe(false);
  });
});
