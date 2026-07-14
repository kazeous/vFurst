import { handlers } from "@/lib/auth";
import {
  AUTH_RATE_LIMIT_PER_MINUTE,
  RATE_LIMIT_FAILURE_MODES,
  RATE_LIMIT_WINDOW_MS,
  RateLimitUnavailableError,
  applyFixedWindowRateLimit,
  getClientIp,
  rateLimitHeaders,
  rateLimitResponse,
  rateLimitUnavailableResponse
} from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

const { GET: authGet, POST: authPost } = handlers;

export const GET = authGet;

export async function POST(request: NextRequest) {
  let rate;
  try {
    rate = await applyFixedWindowRateLimit({
      namespace: "auth",
      key: getClientIp(request),
      limit: AUTH_RATE_LIMIT_PER_MINUTE,
      windowMs: RATE_LIMIT_WINDOW_MS,
      failureMode: RATE_LIMIT_FAILURE_MODES.auth
    });
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) {
      return rateLimitUnavailableResponse();
    }
    throw error;
  }

  if (rate.limited) {
    return rateLimitResponse(rate);
  }

  const response = await authPost(request);
  for (const [key, value] of Object.entries(rateLimitHeaders(rate))) {
    response.headers.set(key, value);
  }

  return response;
}
