import { describe, expect, it } from "vitest";
import {
  PUBLIC_API_VERSION,
  publicApiAttendeesResponseV1Schema,
  publicApiBadgeListItemV1Schema,
  publicApiErrorV1Schema,
  publicApiEventDetailV1Schema,
  publicApiEventsResponseV1Schema,
  publicApiRegistrationDetailV1Schema,
  publicApiRegistrationsResponseV1Schema,
  publicApiStoreResponseV1Schema,
  publicApiVendorsResponseV1Schema
} from "./public-api.js";

const ids = {
  addOn: "11111111-1111-4111-8111-111111111111",
  badge: "22222222-2222-4222-8222-222222222222",
  event: "33333333-3333-4333-8333-333333333333",
  org: "44444444-4444-4444-8444-444444444444",
  product: "55555555-5555-4555-8555-555555555555",
  registration: "66666666-6666-4666-8666-666666666666",
  template: "77777777-7777-4777-8777-777777777777",
  type: "88888888-8888-4888-8888-888888888888",
  user: "99999999-9999-4999-8999-999999999999",
  vendor: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
};

const timestamp = "2026-07-17T10:00:00.000Z";

const event = {
  id: ids.event,
  orgId: ids.org,
  name: "Example Convention",
  slug: "example-2027",
  description: "Example event",
  startDate: timestamp,
  endDate: "2026-07-19T10:00:00.000Z",
  venue: "Example Hall",
  status: "PUBLISHED" as const,
  currency: "VND" as const,
  settings: { requireApproval: false },
  createdAt: timestamp,
  updatedAt: timestamp
};

const registrationType = {
  id: ids.type,
  orgId: ids.org,
  eventId: ids.event,
  name: "General",
  price: 150_000,
  maxCapacity: 500,
  scheduledPricing: [],
  sortOrder: 0,
  createdAt: timestamp,
  updatedAt: timestamp
};

const user = {
  id: ids.user,
  email: "attendee@example.test",
  name: "Example Attendee"
};

const badge = {
  id: ids.badge,
  orgId: ids.org,
  registrationId: ids.registration,
  templateId: ids.template,
  barcodeData: "VF-EXAMPLE",
  nfcTag: null,
  pdfUrl: null,
  zplData: null,
  renderIssue: null,
  generatedAt: null,
  printedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp
};

const registrationFields = {
  id: ids.registration,
  orgId: ids.org,
  eventId: ids.event,
  userId: ids.user,
  typeId: ids.type,
  status: "CONFIRMED" as const,
  approvalStatus: "APPROVED" as const,
  checkedInAt: null,
  badgeNumber: "A-001",
  transferredFromId: null,
  createdAt: timestamp,
  updatedAt: timestamp
};

const pagination = {
  page: 1,
  pageSize: 25,
  total: 1,
  pageCount: 1
};

describe("public API v1 contracts", () => {
  it("keeps the public contract version explicit without changing current envelopes", () => {
    expect(PUBLIC_API_VERSION).toBe("v1");
    const response = publicApiEventsResponseV1Schema.parse({ data: [event], pagination });
    expect(response).not.toHaveProperty("version");
    expect(response.data[0]?.currency).toBe("VND");
  });

  it("validates event details with the registration-type relation returned today", () => {
    const detail = publicApiEventDetailV1Schema.parse({
      ...event,
      registrationTypes: [registrationType]
    });

    expect(detail.registrationTypes[0]?.price).toBe(150_000);
  });

  it("validates registration list and detail response shapes separately", () => {
    const list = publicApiRegistrationsResponseV1Schema.parse({
      data: [
        {
          ...registrationFields,
          event: { id: event.id, name: event.name },
          type: registrationType,
          user,
          badges: [badge]
        }
      ],
      pagination
    });
    expect(list.data[0]?.badges[0]?.barcodeData).toBe("VF-EXAMPLE");

    const detail = publicApiRegistrationDetailV1Schema.parse({
      ...registrationFields,
      event,
      type: registrationType,
      user,
      addOns: [
        {
          id: ids.addOn,
          orgId: ids.org,
          registrationId: ids.registration,
          addOnDefinitionId: ids.product,
          price: 25_000,
          quantity: 1,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ],
      badges: [badge]
    });
    expect(detail.addOns).toHaveLength(1);
  });

  it("validates attendee results while excluding private account fields", () => {
    const response = publicApiAttendeesResponseV1Schema.parse({
      data: [
        {
          ...user,
          passwordHash: "must-not-cross-the-contract",
          registrations: [
            {
              id: ids.registration,
              eventId: ids.event,
              status: "CONFIRMED",
              badgeNumber: "A-001"
            }
          ]
        }
      ],
      pagination
    });

    expect(response.data[0]).not.toHaveProperty("passwordHash");
  });

  it("validates vendor and store list shapes including JSON-backed fields", () => {
    const vendors = publicApiVendorsResponseV1Schema.parse({
      data: [
        {
          id: ids.vendor,
          orgId: ids.org,
          eventId: ids.event,
          userId: ids.user,
          businessName: "Example Vendor",
          contactName: "Vendor Owner",
          contactEmail: "vendor@example.test",
          website: null,
          productDescription: "Handmade goods",
          tableType: "standard",
          boothPrice: 1_500_000,
          boothAssignment: null,
          boothPaidAt: null,
          paymentOrderId: null,
          status: "PENDING",
          assistants: [],
          amenities: ["power"],
          files: [],
          preferences: { nearEntrance: true },
          createdAt: timestamp,
          updatedAt: timestamp,
          event: { id: event.id, name: event.name },
          user
        }
      ],
      pagination
    });
    expect(vendors.data[0]?.preferences).toEqual({ nearEntrance: true });

    const store = publicApiStoreResponseV1Schema.parse({
      data: [
        {
          id: ids.product,
          orgId: ids.org,
          eventId: ids.event,
          name: "Convention shirt",
          description: null,
          price: 350_000,
          stock: 20,
          images: [],
          category: "apparel",
          surcharges: [],
          options: [{ name: "Size", values: ["S", "M"] }],
          createdAt: timestamp,
          updatedAt: timestamp,
          event: { id: event.id, name: event.name }
        }
      ],
      pagination
    });
    expect(store.data[0]?.stock).toBe(20);
  });

  it("validates the nested badge response returned by the badges endpoint", () => {
    const result = publicApiBadgeListItemV1Schema.parse({
      ...badge,
      template: { id: ids.template, name: "Default badge" },
      registration: {
        ...registrationFields,
        event: { id: event.id, name: event.name },
        user
      }
    });

    expect(result.registration.user.email).toBe("attendee@example.test");
  });

  it("accepts a badge render issue", () => {
    const result = publicApiBadgeListItemV1Schema.parse({
      ...badge,
      renderIssue: "Printed without: 🦊",
      template: { id: ids.template, name: "Default badge" },
      registration: { ...registrationFields, event: { id: event.id, name: event.name }, user }
    });
    expect(result.renderIssue).toBe("Printed without: 🦊");
  });

  it("matches the current nested error envelope and pagination bounds", () => {
    expect(
      publicApiErrorV1Schema.parse({
        error: { code: "organization_inactive", message: "This organization is not active." }
      }).error.code
    ).toBe("organization_inactive");

    expect(() =>
      publicApiEventsResponseV1Schema.parse({
        data: [],
        pagination: { page: 1, pageSize: 101, total: 0, pageCount: 1 }
      })
    ).toThrow();
  });
});
