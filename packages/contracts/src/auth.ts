import { z } from "zod";

export const AUTHORIZATION_CODE_AUDIENCES = ["platform-manager", "tenant-web"] as const;

export const authorizationCodeAudienceSchema = z.enum(AUTHORIZATION_CODE_AUDIENCES);

const absoluteCallbackUrlSchema = z
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  }, "Callback URLs must use HTTPS except on localhost.");

const base64UrlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);

export const authorizationStartSchema = z.object({
  audience: z.literal("tenant-web"),
  redirectUri: absoluteCallbackUrlSchema,
  state: base64UrlSchema.min(32).max(256),
  codeChallenge: base64UrlSchema.min(43).max(128)
});

export const authorizationCodeClaimsSchema = z.object({
  issuer: z.literal("platform-manager"),
  audience: z.literal("tenant-web"),
  codeId: z.uuid(),
  userId: z.uuid(),
  authVersion: z.number().int().nonnegative(),
  redirectUri: absoluteCallbackUrlSchema,
  codeChallenge: base64UrlSchema.min(43).max(128),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive()
});

export const authorizationCodeExchangeRequestSchema = z.object({
  code: base64UrlSchema.min(32).max(512),
  codeVerifier: base64UrlSchema.min(43).max(128),
  redirectUri: absoluteCallbackUrlSchema
});

export const relyingSessionClaimsSchema = z.object({
  issuer: z.literal("platform-manager"),
  audience: z.literal("tenant-web"),
  sessionId: z.uuid(),
  userId: z.uuid(),
  authVersion: z.number().int().nonnegative(),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive()
});

export const authorizationCodeExchangeResponseSchema = z.object({
  sessionToken: base64UrlSchema.min(32).max(4096),
  claims: relyingSessionClaimsSchema
});

export const authorizationErrorCodes = [
  "invalid_request",
  "invalid_state",
  "invalid_redirect_uri",
  "invalid_code",
  "expired_code",
  "replayed_code",
  "invalid_code_verifier",
  "invalid_audience",
  "session_revoked"
] as const;

export const authorizationErrorSchema = z.object({
  error: z.enum(authorizationErrorCodes),
  message: z.string().min(1).max(500),
  requestId: z.uuid()
});

export type AuthorizationStart = z.infer<typeof authorizationStartSchema>;
export type AuthorizationCodeClaims = z.infer<typeof authorizationCodeClaimsSchema>;
export type AuthorizationCodeExchangeRequest = z.infer<typeof authorizationCodeExchangeRequestSchema>;
export type AuthorizationCodeExchangeResponse = z.infer<typeof authorizationCodeExchangeResponseSchema>;
export type RelyingSessionClaims = z.infer<typeof relyingSessionClaimsSchema>;
