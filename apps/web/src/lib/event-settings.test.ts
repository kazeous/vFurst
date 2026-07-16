import { describe, expect, it } from "vitest";
import { eventSettingsSchema, getCoreEventSettings, mergeCoreEventSettings } from "./event-settings";

const validSettings = {
  eventId: "5b367793-542f-47c3-9e72-e6fc67756473",
  name: "vFurstCon 2027",
  description: "Convention",
  slug: "vfurstcon-2027",
  venue: "Convention Center",
  startDate: "2027-07-10",
  endDate: "2027-07-12",
  requireApproval: false,
  allowTransfers: true,
  maxRegistrationsPerUser: 2
};

describe("eventSettingsSchema", () => {
  it("accepts valid event settings", () => {
    expect(eventSettingsSchema.safeParse(validSettings).success).toBe(true);
  });

  it("rejects invalid slugs", () => {
    expect(eventSettingsSchema.safeParse({ ...validSettings, slug: "Invalid Slug" }).success).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    expect(eventSettingsSchema.safeParse({ ...validSettings, endDate: "2027-07-09" }).success).toBe(false);
  });

  it.each([0, 21])("rejects a registration limit of %s", (maxRegistrationsPerUser) => {
    expect(eventSettingsSchema.safeParse({ ...validSettings, maxRegistrationsPerUser }).success).toBe(false);
  });
});

describe("mergeCoreEventSettings", () => {
  it("preserves unrelated nested event settings", () => {
    const merged = mergeCoreEventSettings(
      {
        vendorConfig: { booths: ["A-01"] },
        emailTemplates: { receipt: { subject: "Receipt" } },
        raffleHistory: [{ winner: "Sam" }],
        requireApproval: false
      },
      {
        requireApproval: true,
        allowTransfers: false,
        maxRegistrationsPerUser: 3
      }
    );

    expect(merged).toMatchObject({
      vendorConfig: { booths: ["A-01"] },
      emailTemplates: { receipt: { subject: "Receipt" } },
      raffleHistory: [{ winner: "Sam" }],
      requireApproval: true,
      allowTransfers: false,
      maxRegistrationsPerUser: 3
    });
  });
});

describe("getCoreEventSettings", () => {
  it.each([0, 21, -1])("fails closed to one registration for an invalid stored limit of %s", (maxRegistrationsPerUser) => {
    expect(getCoreEventSettings({ ...validSettings, maxRegistrationsPerUser }).maxRegistrationsPerUser).toBe(1);
  });
});
