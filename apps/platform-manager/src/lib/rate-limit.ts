import {
  RateLimitUnavailableError,
  createFixedWindowRateLimiter,
  rateLimitResponseHeaders,
  trustedClientIpSubject,
  type FixedWindowCounter,
  type FixedWindowRateLimitResult
} from "@vfurst/auth/rate-limit";
import { normalizeIdentityEmail } from "@vfurst/auth/core";
import { NextResponse } from "next/server";
import { requireManagerRateLimitRuntimeEnv, type PlatformManagerEnvironment } from "./env.js";
import { incrementManagerFixedWindow } from "./redis-rate-limit.js";

export const MANAGER_RATE_LIMIT_WINDOW_MS = 60_000;

export type ManagerRateLimitPolicy =
  | "authorize"
  | "credentialAccount"
  | "credentialIp"
  | "exchange"
  | "revoke";

type ManagerRateLimitConfig = Pick<
  PlatformManagerEnvironment,
  | "authorizeRateLimitPerMinute"
  | "credentialAccountRateLimitPerMinute"
  | "credentialIpRateLimitPerMinute"
  | "exchangeRateLimitPerMinute"
  | "rateLimitPrefix"
  | "revokeRateLimitPerMinute"
  | "trustedClientIpHeader"
>;

const POLICY_NAMESPACES = Object.freeze({
  authorize: "identity:authorize",
  credentialAccount: "auth:credentials:account",
  credentialIp: "auth:credentials:ip",
  exchange: "identity:exchange",
  revoke: "identity:revoke"
} as const satisfies Record<ManagerRateLimitPolicy, string>);

function policyLimit(policy: ManagerRateLimitPolicy, config: ManagerRateLimitConfig) {
  switch (policy) {
    case "credentialAccount":
      return config.credentialAccountRateLimitPerMinute;
    case "credentialIp":
      return config.credentialIpRateLimitPerMinute;
    case "authorize":
      return config.authorizeRateLimitPerMinute;
    case "exchange":
      return config.exchangeRateLimitPerMinute;
    case "revoke":
      return config.revokeRateLimitPerMinute;
  }
}

export function createManagerRateLimitGuard(counter: FixedWindowCounter, config: ManagerRateLimitConfig) {
  const rateLimit = createFixedWindowRateLimiter(counter, {
    prefix: config.rateLimitPrefix,
    onFailure(_error, input) {
      console.error(`Platform-manager rate limit unavailable for ${input.namespace}.`);
    }
  });

  return function guardManagerRequest(
    request: Pick<Request, "headers">,
    policy: ManagerRateLimitPolicy,
    subjectParts: readonly string[] = []
  ) {
    const clientSubject = trustedClientIpSubject(request.headers, config.trustedClientIpHeader);
    const subject =
      policy === "credentialAccount"
        ? subjectParts.join("|")
        : [clientSubject, ...subjectParts].join("|");
    return rateLimit({
      namespace: POLICY_NAMESPACES[policy],
      subject,
      limit: policyLimit(policy, config),
      windowMs: MANAGER_RATE_LIMIT_WINDOW_MS
    });
  };
}

export function applyManagerRateLimit(
  request: Pick<Request, "headers">,
  policy: ManagerRateLimitPolicy,
  subjectParts: readonly string[] = []
) {
  const env = requireManagerRateLimitRuntimeEnv();
  return createManagerRateLimitGuard(
    { increment: (key, windowMs) => incrementManagerFixedWindow(env.redisUrl, key, windowMs) },
    env
  )(request, policy, subjectParts);
}

export async function managerCredentialAttemptAllowed(request: Request, email: string) {
  try {
    const ipResult = await applyManagerRateLimit(request, "credentialIp");
    if (ipResult.limited) return false;

    const accountResult = await applyManagerRateLimit(request, "credentialAccount", [
      normalizeIdentityEmail(email)
    ]);
    return !accountResult.limited;
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) {
      // Credential UX intentionally does not reveal whether the account exists,
      // is throttled, or the distributed safety store is unavailable.
      return false;
    }
    throw error;
  }
}

export function managerRateLimitedResponse(result: FixedWindowRateLimitResult) {
  return NextResponse.json(
    {
      error: {
        code: "rate_limited",
        message: "Too many requests. Please retry after the rate limit resets."
      }
    },
    {
      status: 429,
      headers: {
        ...rateLimitResponseHeaders(result),
        "Cache-Control": "no-store",
        Pragma: "no-cache"
      }
    }
  );
}

export function managerRateLimitUnavailableResponse() {
  return NextResponse.json(
    {
      error: {
        code: "rate_limit_unavailable",
        message: "Request safety controls are temporarily unavailable. Please retry shortly."
      }
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store", Pragma: "no-cache", "Retry-After": "1" }
    }
  );
}

export { RateLimitUnavailableError };
