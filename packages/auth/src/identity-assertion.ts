import {
  createPrivateKey,
  createPublicKey,
  KeyObject,
  randomUUID,
  sign,
  verify
} from "node:crypto";
import {
  relyingSessionClaimsSchema,
  type RelyingSessionClaims
} from "@vfurst/contracts";

export const IDENTITY_ASSERTION_ISSUER = "platform-manager" as const;
export const IDENTITY_ASSERTION_AUDIENCE = "tenant-web" as const;
export const IDENTITY_ASSERTION_TTL_SECONDS = 60;
export const MAX_IDENTITY_ASSERTION_TTL_SECONDS = 120;
export const MAX_IDENTITY_ASSERTION_BYTES = 4_096;

const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PrivateKeyMaterial = KeyObject | string | Buffer;
type PublicKeyMaterial = KeyObject | string | Buffer;

type AssertionHeader = Readonly<{
  alg: "EdDSA";
  kid: string;
  typ: "vfurst-identity-assertion+jws";
}>;

type AssertionPayload = Readonly<{
  iss: typeof IDENTITY_ASSERTION_ISSUER;
  aud: typeof IDENTITY_ASSERTION_AUDIENCE;
  sid: string;
  sub: string;
  authVersion: number;
  iat: number;
  exp: number;
  jti: string;
}>;

type AssertionEnvelope = Readonly<{
  protected: string;
  payload: string;
  signature: string;
}>;

export type IdentityAssertionClaims = RelyingSessionClaims &
  Readonly<{
    jti: string;
    keyId: string;
  }>;

export type IdentityAssertionSigningOptions = Readonly<{
  privateKey: PrivateKeyMaterial;
  keyId: string;
  ttlSeconds?: number;
  now?: Date;
  jti?: string;
}>;

export type IdentityAssertionVerificationOptions = Readonly<{
  audience: string;
  issuer?: string;
  publicKeys: ReadonlyMap<string, PublicKeyMaterial>;
  now?: Date;
  clockSkewSeconds?: number;
}>;

export type IdentityAssertionErrorReason =
  | "invalid_token"
  | "invalid_signature"
  | "invalid_issuer"
  | "invalid_audience"
  | "unknown_key"
  | "expired_token"
  | "token_not_yet_valid";

export class IdentityAssertionError extends Error {
  readonly reason: IdentityAssertionErrorReason;

  constructor(reason: IdentityAssertionErrorReason, message: string) {
    super(message);
    this.name = "IdentityAssertionError";
    this.reason = reason;
  }
}

function epochSeconds(date: Date) {
  const milliseconds = date.getTime();

  if (!Number.isFinite(milliseconds)) {
    throw new TypeError("Assertion time must be a valid date.");
  }

  return Math.floor(milliseconds / 1_000);
}

function requireTtl(ttlSeconds: number) {
  if (
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < 1 ||
    ttlSeconds > MAX_IDENTITY_ASSERTION_TTL_SECONDS
  ) {
    throw new RangeError(
      `Identity assertion TTL must be an integer between 1 and ${MAX_IDENTITY_ASSERTION_TTL_SECONDS} seconds.`
    );
  }
}

function requireKeyId(keyId: string) {
  if (!KEY_ID_PATTERN.test(keyId)) {
    throw new TypeError("Identity assertion key id contains unsupported characters.");
  }
}

function asEd25519PrivateKey(material: PrivateKeyMaterial) {
  const key = material instanceof KeyObject ? material : createPrivateKey(material);

  if (key.type !== "private" || key.asymmetricKeyType !== "ed25519") {
    throw new TypeError("Identity assertions require an Ed25519 private key.");
  }

  return key;
}

function asEd25519PublicKey(material: PublicKeyMaterial) {
  const key = material instanceof KeyObject ? material : createPublicKey(material);

  if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") {
    throw new TypeError("Identity assertions require an Ed25519 public key.");
  }

  return key;
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson(value: string): unknown {
  if (!BASE64URL_PATTERN.test(value)) {
    throw new IdentityAssertionError("invalid_token", "Identity assertion is not valid base64url data.");
  }

  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
  } catch {
    throw new IdentityAssertionError("invalid_token", "Identity assertion contains invalid JSON.");
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEnvelope(token: string): AssertionEnvelope {
  if (
    token.length === 0 ||
    Buffer.byteLength(token, "utf8") > MAX_IDENTITY_ASSERTION_BYTES ||
    !BASE64URL_PATTERN.test(token)
  ) {
    throw new IdentityAssertionError("invalid_token", "Identity assertion has an invalid encoding or size.");
  }

  const candidate = decodeJson(token);

  if (
    !isObject(candidate) ||
    typeof candidate.protected !== "string" ||
    typeof candidate.payload !== "string" ||
    typeof candidate.signature !== "string" ||
    !BASE64URL_PATTERN.test(candidate.protected) ||
    !BASE64URL_PATTERN.test(candidate.payload) ||
    !BASE64URL_PATTERN.test(candidate.signature)
  ) {
    throw new IdentityAssertionError("invalid_token", "Identity assertion envelope is malformed.");
  }

  return {
    protected: candidate.protected,
    payload: candidate.payload,
    signature: candidate.signature
  };
}

function parseHeader(value: unknown): AssertionHeader {
  if (
    !isObject(value) ||
    value.alg !== "EdDSA" ||
    value.typ !== "vfurst-identity-assertion+jws" ||
    typeof value.kid !== "string" ||
    !KEY_ID_PATTERN.test(value.kid)
  ) {
    throw new IdentityAssertionError("invalid_token", "Identity assertion protected header is invalid.");
  }

  return {
    alg: "EdDSA",
    kid: value.kid,
    typ: "vfurst-identity-assertion+jws"
  };
}

function parsePayload(value: unknown): AssertionPayload {
  if (!isObject(value) || typeof value.jti !== "string" || !UUID_PATTERN.test(value.jti)) {
    throw new IdentityAssertionError("invalid_token", "Identity assertion claims are malformed.");
  }

  const claims = relyingSessionClaimsSchema.safeParse({
    issuer: value.iss,
    audience: value.aud,
    sessionId: value.sid,
    userId: value.sub,
    authVersion: value.authVersion,
    issuedAt: value.iat,
    expiresAt: value.exp
  });

  if (!claims.success) {
    throw new IdentityAssertionError("invalid_token", "Identity assertion claims are invalid.");
  }

  if (claims.data.expiresAt <= claims.data.issuedAt) {
    throw new IdentityAssertionError("invalid_token", "Identity assertion expiry must follow its issue time.");
  }

  return {
    iss: claims.data.issuer,
    aud: claims.data.audience,
    sid: claims.data.sessionId,
    sub: claims.data.userId,
    authVersion: claims.data.authVersion,
    iat: claims.data.issuedAt,
    exp: claims.data.expiresAt,
    jti: value.jti
  };
}

/**
 * Produces a compact, contract-compatible base64url assertion. It is intended
 * only for the manager-to-tenant server exchange; the browser should receive
 * the one-time authorization code, never this signed assertion.
 */
export function signIdentityAssertion(
  claims: Pick<RelyingSessionClaims, "sessionId" | "userId" | "authVersion" | "audience">,
  options: IdentityAssertionSigningOptions
) {
  requireKeyId(options.keyId);
  const ttlSeconds = options.ttlSeconds ?? IDENTITY_ASSERTION_TTL_SECONDS;
  requireTtl(ttlSeconds);

  const issuedAt = epochSeconds(options.now ?? new Date());
  const payload = relyingSessionClaimsSchema.parse({
    issuer: IDENTITY_ASSERTION_ISSUER,
    audience: claims.audience,
    sessionId: claims.sessionId,
    userId: claims.userId,
    authVersion: claims.authVersion,
    issuedAt,
    expiresAt: issuedAt + ttlSeconds
  });
  const jti = options.jti ?? randomUUID();

  if (!UUID_PATTERN.test(jti)) {
    throw new TypeError("Identity assertion jti must be a UUID.");
  }

  const assertionPayload: AssertionPayload = {
    iss: payload.issuer,
    aud: payload.audience,
    sid: payload.sessionId,
    sub: payload.userId,
    authVersion: payload.authVersion,
    iat: payload.issuedAt,
    exp: payload.expiresAt,
    jti
  };
  const header: AssertionHeader = {
    alg: "EdDSA",
    kid: options.keyId,
    typ: "vfurst-identity-assertion+jws"
  };
  const protectedHeader = encodeJson(header);
  const encodedPayload = encodeJson(assertionPayload);
  const signingInput = `${protectedHeader}.${encodedPayload}`;
  const signature = sign(null, Buffer.from(signingInput, "ascii"), asEd25519PrivateKey(options.privateKey));
  const token = encodeJson({
    protected: protectedHeader,
    payload: encodedPayload,
    signature: signature.toString("base64url")
  } satisfies AssertionEnvelope);

  if (Buffer.byteLength(token, "utf8") > MAX_IDENTITY_ASSERTION_BYTES) {
    throw new Error("Generated identity assertion exceeds the contract size limit.");
  }

  return {
    token,
    claims: {
      ...payload,
      jti: assertionPayload.jti,
      keyId: options.keyId
    } satisfies IdentityAssertionClaims
  };
}

export function verifyIdentityAssertion(
  token: string,
  options: IdentityAssertionVerificationOptions
): IdentityAssertionClaims {
  const envelope = parseEnvelope(token);
  const header = parseHeader(decodeJson(envelope.protected));
  const keyMaterial = options.publicKeys.get(header.kid);

  if (!keyMaterial) {
    throw new IdentityAssertionError("unknown_key", "Identity assertion key id is not trusted.");
  }

  const signature = Buffer.from(envelope.signature, "base64url");
  const signingInput = `${envelope.protected}.${envelope.payload}`;
  const validSignature = verify(
    null,
    Buffer.from(signingInput, "ascii"),
    asEd25519PublicKey(keyMaterial),
    signature
  );

  if (!validSignature) {
    throw new IdentityAssertionError("invalid_signature", "Identity assertion signature is invalid.");
  }

  const payload = parsePayload(decodeJson(envelope.payload));
  const expectedIssuer = options.issuer ?? IDENTITY_ASSERTION_ISSUER;

  if (payload.iss !== expectedIssuer) {
    throw new IdentityAssertionError("invalid_issuer", "Identity assertion issuer does not match.");
  }

  if (payload.aud !== options.audience) {
    throw new IdentityAssertionError("invalid_audience", "Identity assertion audience does not match.");
  }

  const now = epochSeconds(options.now ?? new Date());
  const clockSkewSeconds = options.clockSkewSeconds ?? 0;

  if (!Number.isSafeInteger(clockSkewSeconds) || clockSkewSeconds < 0 || clockSkewSeconds > 30) {
    throw new RangeError("Identity assertion clock skew must be an integer between 0 and 30 seconds.");
  }

  if (payload.iat > now + clockSkewSeconds) {
    throw new IdentityAssertionError("token_not_yet_valid", "Identity assertion was issued in the future.");
  }

  if (payload.exp <= now - clockSkewSeconds) {
    throw new IdentityAssertionError("expired_token", "Identity assertion has expired.");
  }

  return {
    issuer: payload.iss,
    audience: payload.aud,
    sessionId: payload.sid,
    userId: payload.sub,
    authVersion: payload.authVersion,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
    jti: payload.jti,
    keyId: header.kid
  };
}
