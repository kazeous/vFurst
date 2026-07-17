import { z } from "zod";

export const SERVICE_IDENTITIES = ["platform-manager", "tenant-web", "worker"] as const;

export const serviceRequestMetadataSchema = z.object({
  requestId: z.uuid(),
  correlationId: z.uuid(),
  source: z.enum(SERVICE_IDENTITIES),
  audience: z.enum(SERVICE_IDENTITIES),
  sentAt: z.iso.datetime()
});

export const internalErrorCodes = [
  "bad_request",
  "unauthorized_service",
  "forbidden_capability",
  "not_found",
  "conflict",
  "temporarily_unavailable"
] as const;

export const internalErrorSchema = z.object({
  error: z.enum(internalErrorCodes),
  message: z.string().min(1).max(500),
  requestId: z.uuid(),
  correlationId: z.uuid()
});

export type ServiceRequestMetadata = z.infer<typeof serviceRequestMetadataSchema>;
export type InternalError = z.infer<typeof internalErrorSchema>;
