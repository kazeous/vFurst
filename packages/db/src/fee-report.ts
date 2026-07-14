import type { CurrencyCode, OrderItemType } from "@prisma/client";

export const USD_ATTENDEE_FEE = 100;
export const USD_HOTEL_BOOKING_FEE = 100;
export const DEFAULT_VND_ATTENDEE_FEE = 25_000;
export const DEFAULT_VND_HOTEL_BOOKING_FEE = 25_000;
export const TRANSACTION_FEE_RATE = 0.01;

export type CurrencyFeePolicy = {
  attendeeFee: number;
  hotelBookingFee: number;
};

export type FeePolicyByCurrency = Record<CurrencyCode, CurrencyFeePolicy>;

export type FeeRegistrationUsage = {
  currency: CurrencyCode;
  hasCollectedAttendeeFee: boolean;
};

export type FeeHotelBookingUsage = {
  currency: CurrencyCode;
};

export type FeeOrderUsage = {
  currency: CurrencyCode;
  platformFee: number;
  items: Array<{
    itemType: OrderItemType;
    unitPrice: number;
    quantity: number;
  }>;
};

export type CurrencyFeeSummary = {
  currency: CurrencyCode;
  attendeeCount: number;
  hotelBookingCount: number;
  compedRegistrationCount: number;
  storeVendorRevenue: number;
  attendeeExpected: number;
  attendeeCollected: number;
  hotelExpected: number;
  hotelCollected: number;
  transactionExpected: number;
  transactionCollected: number;
  expectedTotal: number;
  collectedTotal: number;
  discrepancy: number;
};

export function createFeePolicy(input: { registrationFeeVnd: number; hotelFeeVnd: number }): FeePolicyByCurrency {
  return {
    USD: {
      attendeeFee: USD_ATTENDEE_FEE,
      hotelBookingFee: USD_HOTEL_BOOKING_FEE
    },
    VND: {
      attendeeFee: wholeMinorUnits(input.registrationFeeVnd),
      hotelBookingFee: wholeMinorUnits(input.hotelFeeVnd)
    }
  };
}

function wholeMinorUnits(value: number) {
  return Math.max(0, Math.round(value));
}

function unitsForType(order: FeeOrderUsage, type: OrderItemType) {
  return order.items
    .filter((item) => item.itemType === type)
    .reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
}

function storeVendorRevenue(order: FeeOrderUsage) {
  return order.items
    .filter((item) => item.itemType === "PRODUCT" || item.itemType === "VENDOR")
    .reduce((sum, item) => sum + wholeMinorUnits(item.unitPrice * item.quantity), 0);
}

export function calculateFeeSummariesByCurrency(input: {
  policies: FeePolicyByCurrency;
  registrations: FeeRegistrationUsage[];
  hotelBookings: FeeHotelBookingUsage[];
  paidOrders: FeeOrderUsage[];
  includeCurrencies?: CurrencyCode[];
}): CurrencyFeeSummary[] {
  const currencies = new Set<CurrencyCode>(input.includeCurrencies ?? []);

  input.registrations.forEach((registration) => currencies.add(registration.currency));
  input.hotelBookings.forEach((booking) => currencies.add(booking.currency));
  input.paidOrders.forEach((order) => currencies.add(order.currency));

  return Array.from(currencies)
    .sort((left, right) => left.localeCompare(right))
    .map((currency) => {
      const policy = input.policies[currency];
      const registrations = input.registrations.filter((registration) => registration.currency === currency);
      const hotelBookings = input.hotelBookings.filter((booking) => booking.currency === currency);
      const paidOrders = input.paidOrders.filter((order) => order.currency === currency);
      const attendeeCount = registrations.length;
      const hotelBookingCount = hotelBookings.length;
      const storeVendorRevenueTotal = paidOrders.reduce((sum, order) => sum + storeVendorRevenue(order), 0);
      const attendeeExpected = attendeeCount * policy.attendeeFee;
      const hotelExpected = hotelBookingCount * policy.hotelBookingFee;
      const transactionExpected = wholeMinorUnits(storeVendorRevenueTotal * TRANSACTION_FEE_RATE);
      let attendeeCollected = 0;
      let hotelCollected = 0;
      let transactionCollected = 0;
      let collectedTotal = 0;

      for (const order of paidOrders) {
        let remaining = wholeMinorUnits(order.platformFee);
        collectedTotal += remaining;

        const attendeeAllocation = Math.min(remaining, unitsForType(order, "REGISTRATION") * policy.attendeeFee);
        attendeeCollected += attendeeAllocation;
        remaining -= attendeeAllocation;

        const hotelAllocation = Math.min(remaining, unitsForType(order, "HOTEL") * policy.hotelBookingFee);
        hotelCollected += hotelAllocation;
        remaining -= hotelAllocation;

        transactionCollected += remaining;
      }

      const expectedTotal = attendeeExpected + hotelExpected + transactionExpected;

      return {
        currency,
        attendeeCount,
        hotelBookingCount,
        compedRegistrationCount: registrations.filter((registration) => !registration.hasCollectedAttendeeFee).length,
        storeVendorRevenue: storeVendorRevenueTotal,
        attendeeExpected,
        attendeeCollected,
        hotelExpected,
        hotelCollected,
        transactionExpected,
        transactionCollected,
        expectedTotal,
        collectedTotal,
        discrepancy: expectedTotal - collectedTotal
      };
    });
}
