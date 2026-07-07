import { handlers } from "@/lib/auth";
import {
  AUTH_RATE_LIMIT_PER_MINUTE,
  RATE_LIMIT_WINDOW_MS,
  applyFixedWindowRateLimit,
  getClientIp,
  rateLimitHeaders,
  rateLimitResponse
} from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

const { GET: authGet, POST: authPost } = handlers;

export const GET = authGet;

export async function POST(request: NextRequest) {
  const rate = applyFixedWindowRateLimit({
    namespace: "auth",
    key: getClientIp(request),
    limit: AUTH_RATE_LIMIT_PER_MINUTE,
    windowMs: RATE_LIMIT_WINDOW_MS
  });

  if (rate.limited) {
    return rateLimitResponse(rate);
  }

  const response = await authPost(request);
  for (const [key, value] of Object.entries(rateLimitHeaders(rate))) {
    response.headers.set(key, value);
  }

  return response;
}
