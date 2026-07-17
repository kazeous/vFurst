import { createHash } from "node:crypto";
import { isIP } from "node:net";

export type FixedWindowIncrement = Readonly<{
  count: number;
  resetAt: number;
}>;

export interface FixedWindowCounter {
  increment(key: string, windowMs: number): Promise<FixedWindowIncrement>;
}

export type FixedWindowRateLimitInput = Readonly<{
  namespace: string;
  subject: string;
  limit: number;
  windowMs: number;
}>;

export type FixedWindowRateLimitResult = Readonly<{
  limited: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}>;

export type TrustedClientIpHeader =
  | "cf-connecting-ip"
  | "fly-client-ip"
  | "true-client-ip"
  | "x-forwarded-for"
  | "x-real-ip";

export const TRUSTED_CLIENT_IP_HEADERS = Object.freeze([
  "cf-connecting-ip",
  "fly-client-ip",
  "true-client-ip",
  "x-forwarded-for",
  "x-real-ip"
] as const satisfies readonly TrustedClientIpHeader[]);

export const UNTRUSTED_PROXY_RATE_LIMIT_SUBJECT = "shared-untrusted-proxy";

type RateLimitFailureHandler = (error: unknown, input: FixedWindowRateLimitInput) => void;

function safeKeySegment(value: string, fallback: string) {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized.slice(0, 80) || fallback;
}

export function fixedWindowStorageKey(prefix: string, namespace: string, subject: string) {
  const safePrefix = safeKeySegment(prefix, "vfurst:rate-limit");
  const safeNamespace = safeKeySegment(namespace, "default");
  const subjectHash = createHash("sha256").update(subject, "utf8").digest("hex");
  return `${safePrefix}:${safeNamespace}:${subjectHash}`;
}

export class RateLimitUnavailableError extends Error {
  constructor(public readonly cause?: unknown) {
    super("Request safety controls are temporarily unavailable.");
    this.name = "RateLimitUnavailableError";
  }
}

export function createFixedWindowRateLimiter(
  counter: FixedWindowCounter,
  options: Readonly<{
    prefix: string;
    onFailure?: RateLimitFailureHandler;
  }>
) {
  return async function applyFixedWindowRateLimit(
    input: FixedWindowRateLimitInput
  ): Promise<FixedWindowRateLimitResult> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1) {
      throw new RangeError("Rate limit must be a positive integer.");
    }
    if (!Number.isSafeInteger(input.windowMs) || input.windowMs < 1) {
      throw new RangeError("Rate-limit window must be a positive integer.");
    }

    let increment: FixedWindowIncrement;
    try {
      increment = await counter.increment(
        fixedWindowStorageKey(options.prefix, input.namespace, input.subject),
        input.windowMs
      );
    } catch (error) {
      options.onFailure?.(error, input);
      throw new RateLimitUnavailableError(error);
    }

    if (
      !Number.isSafeInteger(increment.count) ||
      increment.count < 1 ||
      !Number.isSafeInteger(increment.resetAt) ||
      increment.resetAt < 1
    ) {
      throw new RateLimitUnavailableError(new Error("Rate-limit storage returned an invalid value."));
    }

    return Object.freeze({
      limited: increment.count > input.limit,
      limit: input.limit,
      remaining: Math.max(0, input.limit - increment.count),
      resetAt: increment.resetAt
    });
  };
}

function firstHeaderValue(value: string, header: TrustedClientIpHeader) {
  return header === "x-forwarded-for" ? value.split(",", 1)[0]?.trim() : value.trim();
}

/**
 * Forwarded client-IP headers are attacker-controlled unless an ingress proxy
 * removes incoming copies and writes its own value. Callers must explicitly
 * name that trusted header. Without one, all requests use a safe shared bucket.
 */
export function trustedClientIpSubject(headers: Headers, trustedHeader?: TrustedClientIpHeader) {
  if (!trustedHeader) return UNTRUSTED_PROXY_RATE_LIMIT_SUBJECT;

  const candidate = firstHeaderValue(headers.get(trustedHeader) ?? "", trustedHeader);
  return candidate && isIP(candidate) !== 0 ? candidate : UNTRUSTED_PROXY_RATE_LIMIT_SUBJECT;
}

export function rateLimitResponseHeaders(result: FixedWindowRateLimitResult, now = Date.now()) {
  return Object.freeze({
    "Retry-After": String(Math.max(1, Math.ceil((result.resetAt - now) / 1_000))),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1_000))
  });
}
