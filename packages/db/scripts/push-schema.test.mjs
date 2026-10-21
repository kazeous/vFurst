import { describe, expect, it, vi } from "vitest";
import { ATTENDEE_PROFILE_NULL_MARKER, pushSchemaWithAttendeeProfiles } from "./push-schema.mjs";
import { formatPreparationResult } from "./prepare-attendee-profiles.mjs";

function fakes(results = [{ status: 0, output: "" }]) {
  const lines = [];
  const prepare = vi.fn(async () => ({ skipped: false, profilesCreated: 0, registrationsAssigned: 1 }));
  let next = 0;
  const push = vi.fn(() => results[Math.min(next++, results.length - 1)]);
  const log = (line) => lines.push(line);
  return { prepare, push, log, lines };
}

describe("schema push with attendee-profile preparation", () => {
  it("pushes once when the schema applies", async () => {
    const { prepare, push, log, lines } = fakes();
    await expect(pushSchemaWithAttendeeProfiles({ prepare, push, log })).resolves.toEqual({ attempts: 1 });
    expect(prepare).toHaveBeenCalledOnce();
    expect(lines).toEqual(["Attendee-profile preparation complete: 0 profiles created, 1 registrations assigned."]);
  });

  it("retries once after a late registration", async () => {
    const { prepare, push, log, lines } = fakes([
      { status: 1, output: `${ATTENDEE_PROFILE_NULL_MARKER} 1 existing NULL values.` },
      { status: 0, output: "" }
    ]);
    await expect(pushSchemaWithAttendeeProfiles({ prepare, push, log })).resolves.toEqual({ attempts: 2 });
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(lines).toContain("Retrying attendee-profile preparation: registrations without a profile appeared before db push (attempt 2 of 3).");
  });

  it("does not retry other push failures", async () => {
    const { prepare, push, log } = fakes([{ status: 1, output: "P1001: Can't reach database server" }]);
    await expect(pushSchemaWithAttendeeProfiles({ prepare, push, log })).rejects.toMatchObject({
      message: "prisma db push failed.", exitCode: 1
    });
    expect(prepare).toHaveBeenCalledOnce();
  });

  it("gives up after three attempts", async () => {
    const { prepare, push, log, lines } = fakes([{ status: 1, output: ATTENDEE_PROFILE_NULL_MARKER }]);
    await expect(pushSchemaWithAttendeeProfiles({ prepare, push, log })).rejects.toMatchObject({
      message: "Registrations without an attendee profile kept appearing; prisma db push failed after 3 attempts.", exitCode: 1
    });
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(lines.filter((line) => line.startsWith("Retrying attendee-profile preparation"))).toHaveLength(2);
  });

  it("logs the preparation summary", () => {
    expect(formatPreparationResult({ skipped: true, reason: "x" })).toBe("Attendee-profile preparation skipped: x");
    expect(formatPreparationResult({ skipped: false, profilesCreated: 2, registrationsAssigned: 3 }))
      .toBe("Attendee-profile preparation complete: 2 profiles created, 3 registrations assigned.");
  });
});
