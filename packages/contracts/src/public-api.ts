import { z } from "zod";

export const PUBLIC_API_VERSION = "v1" as const;

const timestampSchema = z.iso.datetime();
const jsonValueSchema = z.json();

export const publicApiErrorV1Schema = z.object({
  error: z.object({
    code: z.string().trim().min(1).max(100),
    message: z.string().trim().min(1).max(500)
  })
});

export const publicApiPaginationV1Schema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().nonnegative(),
  pageCount: z.number().int().positive()
});

export function publicApiPaginatedResponseV1Schema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    pagination: publicApiPaginationV1Schema
  });
}

export const publicApiUserSummaryV1Schema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string().nullable()
});

export const publicApiEventSummaryV1Schema = z.object({
  id: z.uuid(),
  name: z.string()
});

export const publicApiEventV1Schema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  startDate: timestampSchema,
  endDate: timestampSchema,
  venue: z.string().nullable(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  currency: z.enum(["USD", "VND"]),
  settings: jsonValueSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema
});

export const publicApiRegistrationTypeV1Schema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  eventId: z.uuid(),
  name: z.string(),
  price: z.number().int().nonnegative(),
  maxCapacity: z.number().int().nonnegative().nullable(),
  scheduledPricing: jsonValueSchema,
  sortOrder: z.number().int(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
});

export const publicApiEventDetailV1Schema = publicApiEventV1Schema.extend({
  registrationTypes: z.array(publicApiRegistrationTypeV1Schema)
});

export const publicApiBadgeV1Schema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  registrationId: z.uuid(),
  templateId: z.uuid(),
  barcodeData: z.string(),
  nfcTag: z.string().nullable(),
  pdfUrl: z.string().nullable(),
  zplData: z.string().nullable(),
  renderIssue: z.string().nullable(),
  generatedAt: timestampSchema.nullable(),
  printedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
});

export const publicApiRegistrationAddOnV1Schema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  registrationId: z.uuid(),
  addOnDefinitionId: z.uuid(),
  price: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
});

export const publicApiRegistrationFieldsV1Schema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  eventId: z.uuid(),
  userId: z.uuid(),
  typeId: z.uuid(),
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "TRANSFERRED", "CHECKED_IN"]),
  approvalStatus: z.enum(["APPROVED", "PENDING", "REJECTED"]),
  checkedInAt: timestampSchema.nullable(),
  badgeNumber: z.string().nullable(),
  transferredFromId: z.uuid().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
});

export const publicApiRegistrationListItemV1Schema = publicApiRegistrationFieldsV1Schema.extend({
  event: publicApiEventSummaryV1Schema,
  type: publicApiRegistrationTypeV1Schema,
  user: publicApiUserSummaryV1Schema,
  badges: z.array(publicApiBadgeV1Schema)
});

export const publicApiRegistrationDetailV1Schema = publicApiRegistrationFieldsV1Schema.extend({
  event: publicApiEventV1Schema,
  type: publicApiRegistrationTypeV1Schema,
  user: publicApiUserSummaryV1Schema,
  addOns: z.array(publicApiRegistrationAddOnV1Schema),
  badges: z.array(publicApiBadgeV1Schema)
});

export const publicApiAttendeeRegistrationV1Schema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "TRANSFERRED", "CHECKED_IN"]),
  badgeNumber: z.string().nullable()
});

export const publicApiAttendeeV1Schema = publicApiUserSummaryV1Schema.extend({
  registrations: z.array(publicApiAttendeeRegistrationV1Schema)
});

export const publicApiVendorApplicationV1Schema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  eventId: z.uuid(),
  userId: z.uuid(),
  businessName: z.string(),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  website: z.string().nullable(),
  productDescription: z.string().nullable(),
  tableType: z.string().nullable(),
  boothPrice: z.number().int().nonnegative(),
  boothAssignment: z.string().nullable(),
  boothPaidAt: timestampSchema.nullable(),
  paymentOrderId: z.uuid().nullable(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "WAITLISTED"]),
  assistants: jsonValueSchema,
  amenities: jsonValueSchema,
  files: jsonValueSchema,
  preferences: jsonValueSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  event: publicApiEventSummaryV1Schema,
  user: publicApiUserSummaryV1Schema
});

export const publicApiStoreProductV1Schema = z.object({
  id: z.uuid(),
  orgId: z.uuid(),
  eventId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
  images: jsonValueSchema,
  category: z.string().nullable(),
  surcharges: jsonValueSchema,
  options: jsonValueSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  event: publicApiEventSummaryV1Schema
});

export const publicApiBadgeListItemV1Schema = publicApiBadgeV1Schema.extend({
  template: z.object({
    id: z.uuid(),
    name: z.string()
  }),
  registration: publicApiRegistrationFieldsV1Schema.extend({
    event: publicApiEventSummaryV1Schema,
    user: publicApiUserSummaryV1Schema
  })
});

export const publicApiEventsResponseV1Schema = publicApiPaginatedResponseV1Schema(publicApiEventV1Schema);
export const publicApiRegistrationsResponseV1Schema = publicApiPaginatedResponseV1Schema(
  publicApiRegistrationListItemV1Schema
);
export const publicApiAttendeesResponseV1Schema = publicApiPaginatedResponseV1Schema(publicApiAttendeeV1Schema);
export const publicApiVendorsResponseV1Schema = publicApiPaginatedResponseV1Schema(
  publicApiVendorApplicationV1Schema
);
export const publicApiStoreResponseV1Schema = publicApiPaginatedResponseV1Schema(publicApiStoreProductV1Schema);
export const publicApiBadgesResponseV1Schema = publicApiPaginatedResponseV1Schema(publicApiBadgeListItemV1Schema);

export type PublicApiErrorV1 = z.infer<typeof publicApiErrorV1Schema>;
export type PublicApiPaginationV1 = z.infer<typeof publicApiPaginationV1Schema>;
export type PublicApiEventV1 = z.infer<typeof publicApiEventV1Schema>;
export type PublicApiEventDetailV1 = z.infer<typeof publicApiEventDetailV1Schema>;
export type PublicApiRegistrationListItemV1 = z.infer<typeof publicApiRegistrationListItemV1Schema>;
export type PublicApiRegistrationDetailV1 = z.infer<typeof publicApiRegistrationDetailV1Schema>;
export type PublicApiAttendeeV1 = z.infer<typeof publicApiAttendeeV1Schema>;
export type PublicApiVendorApplicationV1 = z.infer<typeof publicApiVendorApplicationV1Schema>;
export type PublicApiStoreProductV1 = z.infer<typeof publicApiStoreProductV1Schema>;
export type PublicApiBadgeListItemV1 = z.infer<typeof publicApiBadgeListItemV1Schema>;
