import { describe, expect, it } from "vitest";
import { calculateFeeSummariesByCurrency, createFeePolicy } from "./fee-report.js";

const policies = createFeePolicy({
  registrationFeeVnd: 25_000,
  hotelFeeVnd: 30_000
});

describe("calculateFeeSummariesByCurrency", () => {
  it("keeps USD cents and VND dong in independent totals", () => {
    const reports = calculateFeeSummariesByCurrency({
      policies,
      registrations: [
        { currency: "USD", hasCollectedAttendeeFee: true },
        { currency: "VND", hasCollectedAttendeeFee: true }
      ],
      hotelBookings: [{ currency: "USD" }, { currency: "VND" }],
      paidOrders: [
        {
          currency: "USD",
          platformFee: 300,
          items: [
            { itemType: "REGISTRATION", unitPrice: 5_000, quantity: 1 },
            { itemType: "HOTEL", unitPrice: 10_000, quantity: 1 },
            { itemType: "PRODUCT", unitPrice: 10_000, quantity: 1 }
          ]
        },
        {
          currency: "VND",
          platformFee: 65_000,
          items: [
            { itemType: "REGISTRATION", unitPrice: 500_000, quantity: 1 },
            { itemType: "HOTEL", unitPrice: 1_000_000, quantity: 1 },
            { itemType: "VENDOR", unitPrice: 1_000_000, quantity: 1 }
          ]
        }
      ]
    });

    expect(reports).toEqual([
      expect.objectContaining({
        currency: "USD",
        attendeeExpected: 100,
        hotelExpected: 100,
        transactionExpected: 100,
        expectedTotal: 300,
        collectedTotal: 300
      }),
      expect.objectContaining({
        currency: "VND",
        attendeeExpected: 25_000,
        hotelExpected: 30_000,
        transactionExpected: 10_000,
        expectedTotal: 65_000,
        collectedTotal: 65_000
      })
    ]);
  });

  it("allocates a mixed order platform fee only once", () => {
    const [report] = calculateFeeSummariesByCurrency({
      policies,
      registrations: [],
      hotelBookings: [],
      paidOrders: [
        {
          currency: "USD",
          platformFee: 150,
          items: [
            { itemType: "REGISTRATION", unitPrice: 0, quantity: 1 },
            { itemType: "HOTEL", unitPrice: 0, quantity: 1 },
            { itemType: "PRODUCT", unitPrice: 0, quantity: 1 }
          ]
        }
      ]
    });

    expect(report).toMatchObject({
      attendeeCollected: 100,
      hotelCollected: 50,
      transactionCollected: 0,
      collectedTotal: 150
    });
    expect(report.attendeeCollected + report.hotelCollected + report.transactionCollected).toBe(report.collectedTotal);
  });

  it("tracks comped registrations inside their own currency bucket", () => {
    const reports = calculateFeeSummariesByCurrency({
      policies,
      registrations: [
        { currency: "USD", hasCollectedAttendeeFee: false },
        { currency: "VND", hasCollectedAttendeeFee: true },
        { currency: "VND", hasCollectedAttendeeFee: false }
      ],
      hotelBookings: [],
      paidOrders: []
    });

    expect(reports.find((report) => report.currency === "USD")?.compedRegistrationCount).toBe(1);
    expect(reports.find((report) => report.currency === "VND")?.compedRegistrationCount).toBe(1);
  });

  it("includes a requested empty currency bucket", () => {
    const [report] = calculateFeeSummariesByCurrency({
      policies,
      registrations: [],
      hotelBookings: [],
      paidOrders: [],
      includeCurrencies: ["VND"]
    });

    expect(report).toMatchObject({
      currency: "VND",
      expectedTotal: 0,
      collectedTotal: 0,
      discrepancy: 0
    });
  });
});
