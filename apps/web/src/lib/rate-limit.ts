import { createHash } from "node:crypto";
import {
  incrementSharedFixedWindow,
  type FixedWindowCounter,
  type FixedWindowIncrement
} from "./redis-rate-limit";

export type RateLimitFailureMode = "closed" | "open";

export type RateLimitOptions = {
  namespace: string;
  key: string;
  limit: number;
  windowMs: number;
  failureMode?: RateLimitFailureMode;
};

export type RateLimitResult = {
  limited: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  degraded: boolean;
};

type RateLimitFailureHandler = (error: unknown, options: RateLimitOptions) => void;

export const RATE_LIMIT_FAILURE_MODES = {
  api: "closed",
  auth: "closed",
  payment: "closed",
  webhook: "open"
} as const satisfies Record<string, RateLimitFailureMode>;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const API_RATE_LIMIT_PER_MINUTE = positiveInteger(process.env.VFURST_API_RATE_LIMIT_PER_MINUTE, 100);
export const AUTH_RATE_LIMIT_PER_MINUTE = positiveInteger(process.env.VFURST_AUTH_RATE_LIMIT_PER_MINUTE, 30);
export const PAYMENT_RATE_LIMIT_PER_MINUTE = positiveInteger(process.env.VFURST_PAYMENT_RATE_LIMIT_PER_MINUTE, 60);
export const STRIPE_WEBHOOK_RATE_LIMIT_PER_MINUTE = positiveInteger(
  process.env.VFURST_STRIPE_WEBHOOK_RATE_LIMIT_PER_MINUTE,
  240
);
export const SEPAY_WEBHOOK_RATE_LIMIT_PER_MINUTE = positiveInteger(
  process.env.VFURST_SEPAY_WEBHOOK_RATE_LIMIT_PER_MINUTE,
  240
);
export const RATE_LIMIT_WINDOW_MS = 60_000;

function safeKeySegment(value: string, fallback: string) {
  const sanitized = value.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized.slice(0, 80) || fallback;
}

export function rateLimitStorageKey(
  namespace: string,
  subject: string,
  prefix = process.env.VFURST_RATE_LIMIT_PREFIX ?? "vfurst:rate-limit"
) {
  const safePrefix = safeKeySegment(prefix, "vfurst:rate-limit");
  const safeNamespace = safeKeySegment(namespace, "default");
  const subjectHash = createHash("sha256").update(subject).digest("hex");
  return `${safePrefix}:${safeNamespace}:${subjectHash}`;
}

export class RateLimitUnavailableError extends Error {
  constructor(public readonly cause?: unknown) {
    super("Request safety controls are temporarily unavailable. Please try again shortly.");
    this.name = "RateLimitUnavailableError";
  }
}

export class RateLimitExceededError extends Error {
  constructor(public readonly result: RateLimitResult, message = "Too many payment attempts. Please wait a minute and try again.") {
    super(message);
    this.name = "RateLimitExceededError";
  }
}

export function createFixedWindowRateLimiter(
  counter: FixedWindowCounter,
  options: {
    prefix?: string;
    onFailure?: RateLimitFailureHandler;
  } = {}
) {
  return async function fixedWindowRateLimit(input: RateLimitOptions): Promise<RateLimitResult> {
    const failureMode = input.failureMode ?? "closed";

    if (!Number.isSafeInteger(input.limit) || input.limit < 1) {
      throw new Error("Rate limit must be a positive integer.");
    }
    if (!Number.isSafeInteger(input.windowMs) || input.windowMs < 1) {
      throw new Error("Rate-limit window must be a positive integer.");
    }

    let increment: FixedWindowIncrement;
    try {
      increment = await counter.increment(
        rateLimitStorageKey(input.namespace, input.key, options.prefix),
        input.windowMs
      );
    } catch (error) {
      options.onFailure?.(error, input);

      if (failureMode === "open") {
        return {
          limited: false,
          limit: input.limit,
          remaining: input.limit,
          resetAt: Date.now() + input.windowMs,
          degraded: true
        };
      }

      throw new RateLimitUnavailableError(error);
    }

    return {
      limited: increment.count > input.limit,
      limit: input.limit,
      remaining: Math.max(0, input.limit - increment.count),
      resetAt: increment.resetAt,
      degraded: false
    };
  };
}

const sharedRateLimit = createFixedWindowRateLimiter(
  {
    increment: incrementSharedFixedWindow
  },
  {
    onFailure(error, options) {
      console.error(`Shared rate limit unavailable for ${options.namespace}.`, error);
    }
  }
);

export function getClientIpFromHeaders(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || headers.get("x-real-ip") || "local";
}

export function getClientIp(request: Request) {
  return getClientIpFromHeaders(request.headers);
}

export function applyFixedWindowRateLimit(options: RateLimitOptions) {
  return sharedRateLimit(options);
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "x-ratelimit-limit": String(result.limit),
    "x-ratelimit-remaining": String(result.remaining),
    "x-ratelimit-reset": String(Math.ceil(result.resetAt / 1000))
  };
}

export function rateLimitResponse(result: RateLimitResult) {
  return Response.json(
    {
      error: {
        code: "rate_limited",
        message: "Too many requests. Please retry after the rate limit resets."
      }
    },
    {
      status: 429,
      headers: {
        ...rateLimitHeaders(result),
        "retry-after": String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)))
      }
    }
  );
}

export function rateLimitUnavailableResponse() {
  return Response.json(
    {
      error: {
        code: "rate_limit_unavailable",
        message: "Request safety controls are temporarily unavailable. Please retry shortly."
      }
    },
    {
      status: 503,
      headers: {
        "retry-after": "1"
      }
    }
  );
}

export async function assertActionRateLimit(
  namespace: string,
  key: string,
  limit = PAYMENT_RATE_LIMIT_PER_MINUTE
) {
  const result = await applyFixedWindowRateLimit({
    namespace,
    key,
    limit,
    windowMs: RATE_LIMIT_WINDOW_MS,
    failureMode: RATE_LIMIT_FAILURE_MODES.payment
  });

  if (result.limited) {
    throw new RateLimitExceededError(result);
  }
}

export async function assertAuthActionRateLimit(
  namespace: string,
  key: string,
  message = "Too many account-recovery requests. Please wait a minute and try again."
): Promise<void> {
  const result = await applyFixedWindowRateLimit({
    namespace,
    key,
    limit: AUTH_RATE_LIMIT_PER_MINUTE,
    windowMs: RATE_LIMIT_WINDOW_MS,
    failureMode: RATE_LIMIT_FAILURE_MODES.auth
  });

  if (result.limited) {
    throw new RateLimitExceededError(result, message);
  }
}
