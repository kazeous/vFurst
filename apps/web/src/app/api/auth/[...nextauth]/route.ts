import { getStaffSession, handlers } from "@/lib/auth";
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
import { beginStaffOidcFlow } from "@/lib/staff-oidc-flow";
import { getCentralAppUrl } from "@/lib/central-url";

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

  // Direct Auth.js clients (including the load harness) use the same one-use
  // login intent as the Server Action. Auth.js still validates its CSRF token.
  if (request.nextUrl.pathname === "/api/auth/signin/authentik") {
    if (request.headers.get("origin") !== new URL(getCentralAppUrl()).origin) return new Response(null, { status: 403 });
    const purpose = request.nextUrl.searchParams.get("vfurstPurpose") === "lease" ? "lease" : "login";
    const session = purpose === "lease" ? await getStaffSession() : null;
    if (purpose === "lease" && !session?.user?.id) return new Response(null, { status: 401 });
    await beginStaffOidcFlow({ purpose, returnTo: "/dashboard",
      ...(session?.user?.id ? { actor: { userId: session.user.id, sessionId: session.identitySessionId, authVersion: session.authVersion } } : {}) });
  }
  const response = await authPost(request);
  for (const [key, value] of Object.entries(rateLimitHeaders(rate))) {
    response.headers.set(key, value);
  }

  return response;
}
