import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from "node:crypto";
import {
  authorizationStartSchema,
  type AuthorizationStart
} from "@vfurst/contracts";
import {
  AUTH_COOKIE_NAMES,
  HOST_ONLY_TRANSACTION_COOKIE_POLICY,
  createAuthorizationState,
  createPkceS256Challenge,
  createPkceVerifier,
  isSafeLocalReturnPath,
  safeLocalReturnPath,
  type HostOnlyTransactionCookiePolicy
} from "./core.js";

export const AUTHORIZATION_TRANSACTION_KEY_BYTES = 32;
export const AUTHORIZATION_TRANSACTION_TTL_SECONDS = 5 * 60;

const TRANSACTION_VERSION = "v1";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_CONTEXT = Buffer.from(
  `${TRANSACTION_VERSION}:${AUTH_COOKIE_NAMES.tenantTransaction}`,
  "utf8"
);
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TransactionPayload = Readonly<{
  transactionId: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
  returnTo: string;
  issuedAt: number;
  expiresAt: number;
}>;

export type AuthorizationTransactionCookie = Readonly<{
  name: typeof AUTH_COOKIE_NAMES.tenantTransaction;
  value: string;
  options: HostOnlyTransactionCookiePolicy;
}>;

export type StartAuthorizationTransactionInput = Readonly<{
  encryptionKey: Uint8Array;
  redirectUri: string;
  returnTo?: string;
  now?: Date;
}>;

export type ConsumeAuthorizationTransactionInput = Readonly<{
  encryptionKey: Uint8Array;
  cookieValue: string;
  state: string;
  now?: Date;
}>;

export type AuthorizationTransactionErrorReason =
  | "invalid_transaction"
  | "invalid_state"
  | "expired_transaction";

export class AuthorizationTransactionError extends Error {
  readonly reason: AuthorizationTransactionErrorReason;

  constructor(reason: AuthorizationTransactionErrorReason, message: string) {
    super(message);
    this.name = "AuthorizationTransactionError";
    this.reason = reason;
  }
}

function epochSeconds(date: Date) {
  const milliseconds = date.getTime();

  if (!Number.isFinite(milliseconds)) {
    throw new TypeError("Authorization transaction time must be a valid date.");
  }

  return Math.floor(milliseconds / 1_000);
}

function requireEncryptionKey(key: Uint8Array) {
  if (key.byteLength !== AUTHORIZATION_TRANSACTION_KEY_BYTES) {
    throw new RangeError(
      `Authorization transaction key must be ${AUTHORIZATION_TRANSACTION_KEY_BYTES} bytes.`
    );
  }

  return Buffer.from(key);
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function encryptTransaction(payload: TransactionPayload, key: Uint8Array) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, requireEncryptionKey(key), iv, {
    authTagLength: AUTH_TAG_BYTES
  });
  cipher.setAAD(ENCRYPTION_CONTEXT);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return [
    TRANSACTION_VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    authTag.toString("base64url")
  ].join(".");
}

function decryptTransaction(cookieValue: string, key: Uint8Array): unknown {
  const [version, encodedIv, encodedCiphertext, encodedAuthTag, extra] = cookieValue.split(".");

  if (
    version !== TRANSACTION_VERSION ||
    extra !== undefined ||
    !encodedIv ||
    !encodedCiphertext ||
    !encodedAuthTag ||
    !BASE64URL_PATTERN.test(encodedIv) ||
    !BASE64URL_PATTERN.test(encodedCiphertext) ||
    !BASE64URL_PATTERN.test(encodedAuthTag)
  ) {
    throw new AuthorizationTransactionError(
      "invalid_transaction",
      "Authorization transaction cookie is malformed."
    );
  }

  try {
    const iv = Buffer.from(encodedIv, "base64url");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");
    const authTag = Buffer.from(encodedAuthTag, "base64url");

    if (iv.byteLength !== IV_BYTES || authTag.byteLength !== AUTH_TAG_BYTES) {
      throw new Error("invalid encryption parameters");
    }

    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, requireEncryptionKey(key), iv, {
      authTagLength: AUTH_TAG_BYTES
    });
    decipher.setAAD(ENCRYPTION_CONTEXT);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof RangeError) {
      throw error;
    }
    throw new AuthorizationTransactionError(
      "invalid_transaction",
      "Authorization transaction cookie could not be authenticated."
    );
  }
}

function parsePayload(candidate: unknown): TransactionPayload {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate) ||
    !("transactionId" in candidate) ||
    typeof candidate.transactionId !== "string" ||
    !UUID_PATTERN.test(candidate.transactionId) ||
    !("state" in candidate) ||
    typeof candidate.state !== "string" ||
    !("codeVerifier" in candidate) ||
    typeof candidate.codeVerifier !== "string" ||
    !("redirectUri" in candidate) ||
    typeof candidate.redirectUri !== "string" ||
    !("returnTo" in candidate) ||
    typeof candidate.returnTo !== "string" ||
    !("issuedAt" in candidate) ||
    typeof candidate.issuedAt !== "number" ||
    !Number.isSafeInteger(candidate.issuedAt) ||
    !("expiresAt" in candidate) ||
    typeof candidate.expiresAt !== "number" ||
    !Number.isSafeInteger(candidate.expiresAt)
  ) {
    throw new AuthorizationTransactionError(
      "invalid_transaction",
      "Authorization transaction payload is malformed."
    );
  }

  const start = authorizationStartSchema.safeParse({
    audience: "tenant-web",
    redirectUri: candidate.redirectUri,
    state: candidate.state,
    codeChallenge: createPkceS256Challenge(candidate.codeVerifier)
  });

  if (
    !start.success ||
    !isSafeLocalReturnPath(candidate.returnTo) ||
    candidate.expiresAt - candidate.issuedAt !== AUTHORIZATION_TRANSACTION_TTL_SECONDS
  ) {
    throw new AuthorizationTransactionError(
      "invalid_transaction",
      "Authorization transaction payload is invalid."
    );
  }

  return {
    transactionId: candidate.transactionId,
    state: candidate.state,
    codeVerifier: candidate.codeVerifier,
    redirectUri: candidate.redirectUri,
    returnTo: candidate.returnTo,
    issuedAt: candidate.issuedAt,
    expiresAt: candidate.expiresAt
  };
}

export function startAuthorizationTransaction(
  input: StartAuthorizationTransactionInput
): Readonly<{
  authorization: AuthorizationStart;
  cookie: AuthorizationTransactionCookie;
}> {
  const issuedAt = epochSeconds(input.now ?? new Date());
  const state = createAuthorizationState();
  const codeVerifier = createPkceVerifier();
  const authorization = authorizationStartSchema.parse({
    audience: "tenant-web",
    redirectUri: input.redirectUri,
    state,
    codeChallenge: createPkceS256Challenge(codeVerifier)
  });
  const payload: TransactionPayload = {
    transactionId: randomUUID(),
    state,
    codeVerifier,
    redirectUri: authorization.redirectUri,
    returnTo: safeLocalReturnPath(input.returnTo, "/dashboard"),
    issuedAt,
    expiresAt: issuedAt + AUTHORIZATION_TRANSACTION_TTL_SECONDS
  };

  return {
    authorization,
    cookie: {
      name: AUTH_COOKIE_NAMES.tenantTransaction,
      value: encryptTransaction(payload, input.encryptionKey),
      options: HOST_ONLY_TRANSACTION_COOKIE_POLICY
    }
  };
}

/**
 * Validates and decrypts a host-only transaction cookie. The route consuming
 * this result must clear the cookie immediately, whether exchange succeeds or
 * fails; the manager-issued authorization code supplies the durable replay
 * protection.
 */
export function consumeAuthorizationTransaction(input: ConsumeAuthorizationTransactionInput) {
  const payload = parsePayload(decryptTransaction(input.cookieValue, input.encryptionKey));
  const now = epochSeconds(input.now ?? new Date());

  if (payload.expiresAt <= now) {
    throw new AuthorizationTransactionError(
      "expired_transaction",
      "Authorization transaction has expired."
    );
  }
  if (!constantTimeEqual(payload.state, input.state)) {
    throw new AuthorizationTransactionError("invalid_state", "Authorization state does not match.");
  }

  return payload;
}
