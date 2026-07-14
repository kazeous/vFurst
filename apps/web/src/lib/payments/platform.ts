import {
  DEFAULT_VND_ATTENDEE_FEE,
  DEFAULT_VND_HOTEL_BOOKING_FEE,
  prisma,
  type CurrencyCode,
  type PaymentProvider,
  type Prisma
} from "@vfurst/db";
import { z } from "zod";

export const sepaySettingsSchema = z.object({
  bankCode: z.string().trim().min(2).default(""),
  accountNumber: z.string().trim().min(4).default(""),
  accountHolder: z.string().trim().min(2).default(""),
  bankAccountId: z.string().trim().default(""),
  memoPrefix: z.string().trim().max(40).default(""),
  registrationFeeVnd: z.coerce.number().int().min(0).default(DEFAULT_VND_ATTENDEE_FEE),
  hotelFeeVnd: z.coerce.number().int().min(0).default(DEFAULT_VND_HOTEL_BOOKING_FEE)
});

export type SePaySettings = z.infer<typeof sepaySettingsSchema>;

export type ProviderState = {
  provider: PaymentProvider;
  enabled: boolean;
  configured: boolean;
  settings: Prisma.JsonValue;
};

function parseSePaySettings(settings: Prisma.JsonValue | undefined): SePaySettings {
  const parsed = sepaySettingsSchema.safeParse(settings ?? {});
  return parsed.success
    ? parsed.data
    : {
        bankCode: "",
        accountNumber: "",
        accountHolder: "",
        bankAccountId: "",
        memoPrefix: "",
        registrationFeeVnd: DEFAULT_VND_ATTENDEE_FEE,
        hotelFeeVnd: DEFAULT_VND_HOTEL_BOOKING_FEE
      };
}

export function isSePayEnvironmentReady() {
  return Boolean(process.env.SEPAY_WEBHOOK_SECRET && process.env.SEPAY_API_TOKEN && process.env.CHECKOUT_TOKEN_SECRET);
}

export function isSePaySettingsReady(settings: SePaySettings) {
  return Boolean(settings.bankCode && settings.accountNumber && settings.accountHolder && settings.bankAccountId);
}

export async function getProviderStates(): Promise<Record<PaymentProvider, ProviderState>> {
  const configs = await prisma.paymentProviderConfig.findMany();
  const stripe = configs.find((config) => config.provider === "STRIPE");
  const sepay = configs.find((config) => config.provider === "SEPAY");
  const sepaySettings = parseSePaySettings(sepay?.settings);

  return {
    STRIPE: {
      provider: "STRIPE",
      enabled: stripe?.enabled ?? true,
      configured: Boolean(process.env.STRIPE_SECRET_KEY),
      settings: stripe?.settings ?? {}
    },
    SEPAY: {
      provider: "SEPAY",
      enabled: sepay?.enabled ?? false,
      configured: isSePayEnvironmentReady() && isSePaySettingsReady(sepaySettings),
      settings: sepaySettings
    }
  };
}

export async function getSePaySettings() {
  const config = await prisma.paymentProviderConfig.findUnique({
    where: {
      provider: "SEPAY"
    }
  });

  return parseSePaySettings(config?.settings);
}

export function selectEligiblePaymentProviders(input: {
  currency: CurrencyCode;
  stripeEnabled: boolean;
  stripeConfigured: boolean;
  stripeConnected: boolean;
  sepayEnabled: boolean;
  sepayConfigured: boolean;
}) {
  const providers: PaymentProvider[] = [];
  if (input.stripeEnabled && input.stripeConfigured && input.stripeConnected) {
    providers.push("STRIPE");
  }
  if (input.currency === "VND" && input.sepayEnabled && input.sepayConfigured) {
    providers.push("SEPAY");
  }
  return providers;
}

export async function getEligiblePaymentProviders(orgId: string, currency: CurrencyCode) {
  const [states, stripeConnect] = await Promise.all([
    getProviderStates(),
    prisma.stripeConnect.findUnique({
      where: {
        orgId
      }
    })
  ]);

  return selectEligiblePaymentProviders({
    currency,
    stripeEnabled: states.STRIPE.enabled,
    stripeConfigured: states.STRIPE.configured,
    stripeConnected: Boolean(stripeConnect?.onboardingComplete),
    sepayEnabled: states.SEPAY.enabled,
    sepayConfigured: states.SEPAY.configured
  });
}

export async function assertPaidCheckoutAvailable(orgId: string, currency: CurrencyCode) {
  if ((await getEligiblePaymentProviders(orgId, currency)).length === 0) {
    throw new Error("Payments are temporarily unavailable for this event. No reservation or order was created.");
  }
}
