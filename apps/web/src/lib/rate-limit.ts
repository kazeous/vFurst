type RateEntry = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  namespace: string;
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  limited: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

const stores = new Map<string, Map<string, RateEntry>>();

export const AUTH_RATE_LIMIT_PER_MINUTE = Number(process.env.VFURST_AUTH_RATE_LIMIT_PER_MINUTE ?? 30);
export const PAYMENT_RATE_LIMIT_PER_MINUTE = Number(process.env.VFURST_PAYMENT_RATE_LIMIT_PER_MINUTE ?? 60);
export const STRIPE_WEBHOOK_RATE_LIMIT_PER_MINUTE = Number(process.env.VFURST_STRIPE_WEBHOOK_RATE_LIMIT_PER_MINUTE ?? 240);
export const RATE_LIMIT_WINDOW_MS = 60_000;

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "local";
}

export function applyFixedWindowRateLimit({ namespace, key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const store = stores.get(namespace) ?? new Map<string, RateEntry>();
  const existing = store.get(key);
  const entry = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };

  entry.count += 1;
  store.set(key, entry);
  stores.set(namespace, store);

  return {
    limited: entry.count > limit,
    limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.resetAt
  };
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
      headers: rateLimitHeaders(result)
    }
  );
}

export function assertActionRateLimit(namespace: string, key: string, limit = PAYMENT_RATE_LIMIT_PER_MINUTE) {
  const result = applyFixedWindowRateLimit({
    namespace,
    key,
    limit,
    windowMs: RATE_LIMIT_WINDOW_MS
  });

  if (result.limited) {
    throw new Error("Too many payment attempts. Please wait a minute and try again.");
  }
}
