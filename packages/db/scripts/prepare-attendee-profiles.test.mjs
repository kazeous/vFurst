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
    expect(statements).toHaveLength(9);
    expect(statements[7]).toContain('INSERT INTO "attendee_profiles"');
    expect(statements[7]).toContain("jsonb_to_recordset");
    expect(statements[8]).toContain('UPDATE "registrations"');
    expect(statements[8]).toContain('"attendeeProfileId" IS NULL');
    expect(statements[8]).toContain("jsonb_to_recordset");
    expect(client.$transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 10_000, timeout: 120_000 });
    const [insertCall, updateCall] = client.$executeRaw.mock.calls.slice(7);
    const profiles = JSON.parse(insertCall[1]);
    expect(profiles).toEqual([
      { id: expect.any(String), orgId: "o1", portalAccountId: "a1", accountHolderOf: "a1", fullName: "Mai Le" },
      { id: expect.any(String), orgId: "o1", portalAccountId: "a1", accountHolderOf: null, fullName: "Mai Le (2)" }
    ]);
    expect(JSON.parse(updateCall[1])).toEqual([
      { registrationId: "r1", attendeeProfileId: profiles[0].id },
      { registrationId: "r2", attendeeProfileId: profiles[1].id }
    ]);
  });

  it("is a no-op when no registration lacks a profile", async () => {
    const { client, statements } = mockClient();
    await expect(prepareAttendeeProfiles(client)).resolves.toEqual({ skipped: false, profilesCreated: 0, registrationsAssigned: 0 });
    expect(statements).toHaveLength(7);
    expect(statements.some((sql) => /\b(INSERT|UPDATE)\b/.test(sql))).toBe(false);
  });

  it("writes 5,000 registrations in two statements", async () => {
    const accounts = Array.from({ length: 5_000 }, (_, index) => ({
      id: `a${index}`, orgId: "o1", name: `Nguyễn Văn ${index}`, email: `e${index}@example.com`
    }));
    const registrations = accounts.map((account, index) => ({
      id: `r${index}`, portalAccountId: account.id, eventId: "e1", status: "CONFIRMED", createdAt: new Date("2026-01-01")
    }));
    const { client, statements } = mockClient(registrations, accounts);
    await expect(prepareAttendeeProfiles(client)).resolves.toEqual({ skipped: false, profilesCreated: 5000, registrationsAssigned: 5000 });
    expect(statements).toHaveLength(9);
    const [insertCall, updateCall] = client.$executeRaw.mock.calls.slice(7);
    expect(JSON.parse(insertCall[1])).toHaveLength(5_000);
    expect(JSON.parse(updateCall[1])).toHaveLength(5_000);
  });

  it("reuses existing self profiles without an INSERT", async () => {
    const { client, statements } = mockClient([
      { id: "r1", portalAccountId: "a1", eventId: "e1", status: "CONFIRMED", createdAt: new Date("2026-01-01") }
    ], [{ id: "a1", orgId: "o1", name: "Mai Le", email: "mai@example.com" }], [{ id: "p1", portalAccountId: "a1" }]);
    await expect(prepareAttendeeProfiles(client)).resolves.toEqual({ skipped: false, profilesCreated: 0, registrationsAssigned: 1 });
    expect(statements).toHaveLength(8);
    expect(statements[7]).toContain('UPDATE "registrations"');
    expect(JSON.parse(client.$executeRaw.mock.calls[7][1])).toEqual([{ registrationId: "r1", attendeeProfileId: "p1" }]);
  });

  it("passes unusual names through the payload unchanged", async () => {
    const { client } = mockClient([
      { id: "r1", portalAccountId: "a1", eventId: "e1", status: "CONFIRMED", createdAt: new Date("2026-01-01") }
    ], [{ id: "a1", orgId: "o1", name: '  Lê   "Bé"  O\'Brien\\Ánh ', email: "mai@example.com" }]);
    await prepareAttendeeProfiles(client);
    expect(JSON.parse(client.$executeRaw.mock.calls[7][1])[0].fullName).toBe('Lê "Bé" O\'Brien\\Ánh');
  });
});
