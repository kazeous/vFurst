import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  authorizationCodeClaimsSchema,
  authorizationCodeExchangeRequestSchema,
  relyingSessionClaimsSchema,
  type RelyingSessionClaims
} from "@vfurst/contracts";
import {
  createHashedOpaqueToken,
  createPkceS256Challenge,
  hashOpaqueToken
} from "./core.js";
import {
  IDENTITY_ASSERTION_AUDIENCE,
  IDENTITY_ASSERTION_ISSUER,
  signIdentityAssertion,
  type IdentityAssertionSigningOptions
} from "./identity-assertion.js";

export const AUTHORIZATION_CODE_TTL_SECONDS = 90;
export const MIN_AUTHORIZATION_CODE_TTL_SECONDS = 60;
export const MAX_AUTHORIZATION_CODE_TTL_SECONDS = 120;

const CLIENT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export type AuthorizationCodeRecord = Readonly<{
  codeId: string;
  codeHash: string;
  issuer: typeof IDENTITY_ASSERTION_ISSUER;
  audience: typeof IDENTITY_ASSERTION_AUDIENCE;
  clientId: string;
  userId: string;
  identitySessionId: string;
  authVersion: number;
  redirectUri: string;
  codeChallenge: string;
  issuedAt: number;
  expiresAt: number;
  identitySessionExpiresAt: number;
}>;

export type AtomicAuthorizationCodeConsumeResult =
  | Readonly<{ status: "consumed"; record: AuthorizationCodeRecord }>
  | Readonly<{ status: "missing" }>
  | Readonly<{ status: "replayed" }>;

/**
 * Database adapters must implement consume as one atomic claim operation. A
 * successful result means this caller changed the code from unused to used;
 * all later calls for the same hash must return `replayed`.
 */
export interface AuthorizationCodeStore {
  create(record: AuthorizationCodeRecord): Promise<void>;
  consume(codeHash: string, consumedAt: number): Promise<AtomicAuthorizationCodeConsumeResult>;
}

export type IssueAuthorizationCodeInput = Readonly<{
  audience: typeof IDENTITY_ASSERTION_AUDIENCE;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  userId: string;
  identitySessionId: string;
  identitySessionExpiresAt: number;
  authVersion: number;
}>;

export type ExchangeAuthorizationCodeInput = Readonly<{
  code: string;
  codeVerifier: string;
  redirectUri: string;
  audience: typeof IDENTITY_ASSERTION_AUDIENCE | string;
  clientId: string;
  currentAuthVersion: number;
}>;

export type AuthorizationCodeExchangeResult = Readonly<{
  /** Server-to-server only. The tenant exchanges this for its own host-only session cookie. */
  identityAssertion: string;
  claims: RelyingSessionClaims & Readonly<{ jti: string; keyId: string }>;
}>;

export type AuthorizationCodeServiceOptions = Readonly<{
  store: AuthorizationCodeStore;
  signing: Omit<IdentityAssertionSigningOptions, "now" | "jti">;
  codeTtlSeconds?: number;
  now?: () => Date;
}>;

export type AuthorizationCodeErrorCode =
  | "invalid_request"
  | "invalid_redirect_uri"
  | "invalid_code"
  | "expired_code"
  | "replayed_code"
  | "invalid_code_verifier"
  | "invalid_audience"
  | "session_revoked";

export class AuthorizationCodeError extends Error {
  readonly code: AuthorizationCodeErrorCode;

  constructor(code: AuthorizationCodeErrorCode, message: string) {
    super(message);
    this.name = "AuthorizationCodeError";
    this.code = code;
  }
}

function epochSeconds(date: Date) {
  const milliseconds = date.getTime();

  if (!Number.isFinite(milliseconds)) {
    throw new TypeError("Authorization code clock returned an invalid date.");
  }

  return Math.floor(milliseconds / 1_000);
}

function requireCodeTtl(ttlSeconds: number) {
  if (
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < MIN_AUTHORIZATION_CODE_TTL_SECONDS ||
    ttlSeconds > MAX_AUTHORIZATION_CODE_TTL_SECONDS
  ) {
    throw new RangeError(
      `Authorization code TTL must be an integer between ${MIN_AUTHORIZATION_CODE_TTL_SECONDS} and ${MAX_AUTHORIZATION_CODE_TTL_SECONDS} seconds.`
    );
  }
}

function requireClientId(clientId: string) {
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    throw new AuthorizationCodeError("invalid_request", "Authorization client id is invalid.");
  }
}

function constantTimeStringEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");

  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function validateStoredRecord(record: AuthorizationCodeRecord) {
  const codeClaims = authorizationCodeClaimsSchema.safeParse({
    issuer: record.issuer,
    audience: record.audience,
    clientId: record.clientId,
    codeId: record.codeId,
    userId: record.userId,
    authVersion: record.authVersion,
    redirectUri: record.redirectUri,
    codeChallenge: record.codeChallenge,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt
  });
  const identity = relyingSessionClaimsSchema.safeParse({
    issuer: record.issuer,
    audience: record.audience,
    sessionId: record.identitySessionId,
    userId: record.userId,
    authVersion: record.authVersion,
    issuedAt: record.issuedAt,
    expiresAt: record.identitySessionExpiresAt
  });

  if (
    !codeClaims.success ||
    !identity.success ||
    !CLIENT_ID_PATTERN.test(record.clientId) ||
    !/^[a-f0-9]{64}$/.test(record.codeHash) ||
    record.expiresAt <= record.issuedAt ||
    record.identitySessionExpiresAt <= record.issuedAt
  ) {
    throw new AuthorizationCodeError("invalid_code", "Stored authorization code is invalid.");
  }
}

function parseExchangeRequest(input: ExchangeAuthorizationCodeInput) {
  const parsed = authorizationCodeExchangeRequestSchema.safeParse({
    audience: input.audience,
    clientId: input.clientId,
    code: input.code,
    codeVerifier: input.codeVerifier,
    redirectUri: input.redirectUri
  });

  if (!parsed.success) {
    const fields = new Set(parsed.error.issues.map((issue) => issue.path[0]));

    if (fields.has("code")) {
      throw new AuthorizationCodeError("invalid_code", "Authorization code is malformed.");
    }
    if (fields.has("codeVerifier")) {
      throw new AuthorizationCodeError("invalid_code_verifier", "PKCE verifier is malformed.");
    }
    if (fields.has("redirectUri")) {
      throw new AuthorizationCodeError("invalid_redirect_uri", "Redirect URI is invalid.");
    }

    throw new AuthorizationCodeError("invalid_request", "Authorization code exchange request is invalid.");
  }

  return parsed.data;
}

export class AuthorizationCodeService {
  readonly #store: AuthorizationCodeStore;
  readonly #signing: Omit<IdentityAssertionSigningOptions, "now" | "jti">;
  readonly #codeTtlSeconds: number;
  readonly #now: () => Date;

  constructor(options: AuthorizationCodeServiceOptions) {
    const ttlSeconds = options.codeTtlSeconds ?? AUTHORIZATION_CODE_TTL_SECONDS;
    requireCodeTtl(ttlSeconds);

    this.#store = options.store;
    this.#signing = options.signing;
    this.#codeTtlSeconds = ttlSeconds;
    this.#now = options.now ?? (() => new Date());
  }

  async issue(input: IssueAuthorizationCodeInput) {
    requireClientId(input.clientId);
    const issuedAt = epochSeconds(this.#now());
    const expiresAt = issuedAt + this.#codeTtlSeconds;

    if (input.identitySessionExpiresAt <= expiresAt) {
      throw new AuthorizationCodeError(
        "session_revoked",
        "Identity session does not remain valid for the authorization code lifetime."
      );
    }

    const codeId = randomUUID();
    const claims = authorizationCodeClaimsSchema.safeParse({
      issuer: IDENTITY_ASSERTION_ISSUER,
      audience: input.audience,
      clientId: input.clientId,
      codeId,
      userId: input.userId,
      authVersion: input.authVersion,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      issuedAt,
      expiresAt
    });
    const identity = relyingSessionClaimsSchema.safeParse({
      issuer: IDENTITY_ASSERTION_ISSUER,
      audience: input.audience,
      sessionId: input.identitySessionId,
      userId: input.userId,
      authVersion: input.authVersion,
      issuedAt,
      expiresAt: input.identitySessionExpiresAt
    });

    if (!claims.success || !identity.success) {
      throw new AuthorizationCodeError("invalid_request", "Authorization code claims are invalid.");
    }

    const { token: code, tokenHash: codeHash } = createHashedOpaqueToken(32);
    const record: AuthorizationCodeRecord = {
      ...claims.data,
      clientId: input.clientId,
      identitySessionId: identity.data.sessionId,
      identitySessionExpiresAt: input.identitySessionExpiresAt,
      codeHash
    };

    await this.#store.create(record);

    return {
      code,
      codeId,
      expiresAt
    } as const;
  }

  async exchange(input: ExchangeAuthorizationCodeInput): Promise<AuthorizationCodeExchangeResult> {
    requireClientId(input.clientId);
    if (input.audience !== IDENTITY_ASSERTION_AUDIENCE) {
      throw new AuthorizationCodeError("invalid_audience", "Authorization audience is invalid.");
    }
    const request = parseExchangeRequest(input);
    if (!Number.isSafeInteger(input.currentAuthVersion) || input.currentAuthVersion < 0) {
      throw new AuthorizationCodeError("invalid_request", "Current authentication version is invalid.");
    }

    const nowDate = this.#now();
    const now = epochSeconds(nowDate);
    const codeHash = hashOpaqueToken(request.code);
    const consumed = await this.#store.consume(codeHash, now);

    if (consumed.status === "missing") {
      throw new AuthorizationCodeError("invalid_code", "Authorization code was not found.");
    }
    if (consumed.status === "replayed") {
      throw new AuthorizationCodeError("replayed_code", "Authorization code has already been consumed.");
    }

    const record = consumed.record;
    validateStoredRecord(record);

    if (!constantTimeStringEqual(record.codeHash, codeHash)) {
      throw new AuthorizationCodeError("invalid_code", "Authorization code does not match stored state.");
    }
    if (record.expiresAt <= now) {
      throw new AuthorizationCodeError("expired_code", "Authorization code has expired.");
    }
    if (record.issuedAt > now) {
      throw new AuthorizationCodeError("invalid_code", "Authorization code was issued in the future.");
    }
    if (record.audience !== input.audience || !constantTimeStringEqual(record.clientId, input.clientId)) {
      throw new AuthorizationCodeError(
        "invalid_audience",
        "Authorization code was not issued for this client and audience."
      );
    }
    if (!constantTimeStringEqual(record.redirectUri, request.redirectUri)) {
      throw new AuthorizationCodeError(
        "invalid_redirect_uri",
        "Redirect URI does not match the authorization request."
      );
    }

    const suppliedChallenge = createPkceS256Challenge(request.codeVerifier);
    if (!constantTimeStringEqual(record.codeChallenge, suppliedChallenge)) {
      throw new AuthorizationCodeError("invalid_code_verifier", "PKCE verifier does not match.");
    }
    if (record.authVersion !== input.currentAuthVersion || record.identitySessionExpiresAt <= now) {
      throw new AuthorizationCodeError("session_revoked", "Identity session is no longer valid.");
    }

    const availableSessionLifetime = record.identitySessionExpiresAt - now;
    const requestedAssertionTtl = this.#signing.ttlSeconds ?? 60;
    const assertionTtl = Math.min(requestedAssertionTtl, availableSessionLifetime);
    const assertion = signIdentityAssertion(
      {
        audience: record.audience,
        sessionId: record.identitySessionId,
        userId: record.userId,
        authVersion: record.authVersion
      },
      {
        ...this.#signing,
        ttlSeconds: assertionTtl,
        now: nowDate
      }
    );

    return {
      identityAssertion: assertion.token,
      claims: assertion.claims
    };
  }
}
