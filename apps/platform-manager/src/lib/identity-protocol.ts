import {
  AuthorizationCodeError,
  AuthorizationCodeService
} from "@vfurst/auth/authorization-code";
import { safeLocalReturnPath } from "@vfurst/auth/core";
import {
  authorizationStartSchema,
  identitySessionRevocationRequestSchema,
  type AuthorizationStart
} from "@vfurst/contracts";
import { createPrismaAuthorizationCodeStore, prisma } from "@vfurst/db";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { IdentityProtocolEnvironment } from "./env.js";

export type PublicProtocolError = Readonly<{
  status: number;
  body: Readonly<{
    error: string;
    message: string;
    requestId: string;
  }>;
}>;

function digestSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Compares a strict `Bearer <credential>` header without comparing raw secret lengths. */
export function hasValidServiceBearer(authorization: string | null, expectedSecret: string) {
  if (!authorization?.startsWith("Bearer ") || authorization.slice(7).length === 0) return false;
  const supplied = authorization.slice(7);
  if (/\s/.test(supplied)) return false;
  return timingSafeEqual(digestSecret(supplied), digestSecret(expectedSecret));
}

export function parseAuthorizedStart(
  searchParams: URLSearchParams,
  env: Pick<IdentityProtocolEnvironment, "authClientId" | "authCallbackUrls">
): AuthorizationStart {
  const candidate = authorizationStartSchema.safeParse({
    audience: searchParams.get("audience"),
    clientId: searchParams.get("clientId"),
    redirectUri: searchParams.get("redirectUri"),
    state: searchParams.get("state"),
    codeChallenge: searchParams.get("codeChallenge")
  });

  if (!candidate.success) {
    throw new AuthorizationCodeError("invalid_request", "Authorization request is malformed.");
  }
  if (candidate.data.clientId !== env.authClientId) {
    throw new AuthorizationCodeError("invalid_audience", "Authorization client is not configured.");
  }
  if (!env.authCallbackUrls.includes(candidate.data.redirectUri)) {
    throw new AuthorizationCodeError("invalid_redirect_uri", "Authorization callback is not configured.");
  }

  return candidate.data;
}

export function buildAuthorizationCallback(redirectUri: string, code: string, state: string) {
  const callback = new URL(redirectUri);
  callback.search = "";
  callback.hash = "";
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", state);
  return callback;
}

export function buildManagerLoginRedirect(managerUrl: string, requestedReturnTo: string) {
  const login = new URL("/login", managerUrl);
  login.searchParams.set(
    "returnTo",
    safeLocalReturnPath(requestedReturnTo, "/api/identity/authorize")
  );
  return login;
}

export function createAuthorizationCodeService(env: IdentityProtocolEnvironment, now?: () => Date) {
  return new AuthorizationCodeService({
    store: createPrismaAuthorizationCodeStore(prisma),
    signing: {
      privateKey: env.identityPrivateKey,
      keyId: env.identityKeyId,
      ttlSeconds: 60
    },
    codeTtlSeconds: 90,
    now
  });
}

export function mapProtocolError(error: unknown): PublicProtocolError {
  const requestId = randomUUID();

  if (error instanceof AuthorizationCodeError) {
    const status = error.code === "session_revoked" ? 401 : 400;
    return {
      status,
      body: {
        error: error.code,
        message: "The identity request could not be completed.",
        requestId
      }
    };
  }

  return {
    status: 503,
    body: {
      error: "temporarily_unavailable",
      message: "The identity service is temporarily unavailable.",
      requestId
    }
  };
}

export function unauthorizedServiceError(): PublicProtocolError {
  return {
    status: 401,
    body: {
      error: "unauthorized",
      message: "Service authentication is required.",
      requestId: randomUUID()
    }
  };
}

export function invalidProtocolRequest(): PublicProtocolError {
  return {
    status: 400,
    body: {
      error: "invalid_request",
      message: "The identity request could not be completed.",
      requestId: randomUUID()
    }
  };
}

export function parseIdentitySessionRevocation(value: unknown) {
  const parsed = identitySessionRevocationRequestSchema.safeParse(value);
  if (!parsed.success) {
    throw new AuthorizationCodeError("invalid_request", "Identity session revocation is malformed.");
  }
  return parsed.data;
}

export async function readBoundedJson(request: Pick<Request, "headers" | "text">, maximumBytes = 8_192) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > maximumBytes) {
      throw new AuthorizationCodeError("invalid_request", "Identity request body exceeds its size limit.");
    }
  }

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maximumBytes) {
    throw new AuthorizationCodeError("invalid_request", "Identity request body exceeds its size limit.");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AuthorizationCodeError("invalid_request", "Identity request body is not valid JSON.");
  }
}
