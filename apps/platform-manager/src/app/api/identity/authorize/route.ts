import { auth } from "@/lib/auth";
import { requireIdentityProtocolEnv } from "@/lib/env";
import {
  buildAuthorizationCallback,
  buildManagerLoginRedirect,
  createAuthorizationCodeService,
  mapProtocolError,
  parseAuthorizedStart
} from "@/lib/identity-protocol";
import { prisma } from "@vfurst/db";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  RateLimitUnavailableError,
  applyManagerRateLimit,
  managerRateLimitUnavailableResponse,
  managerRateLimitedResponse
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" }
  });
}

function loginRedirect(request: NextRequest, managerUrl: string) {
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const login = buildManagerLoginRedirect(managerUrl, returnTo);
  return NextResponse.redirect(login, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  try {
    const env = requireIdentityProtocolEnv();
    let rate;
    try {
      rate = await applyManagerRateLimit(request, "authorize");
    } catch (error) {
      if (error instanceof RateLimitUnavailableError) {
        return managerRateLimitUnavailableResponse();
      }
      throw error;
    }
    if (rate.limited) return managerRateLimitedResponse(rate);

    const authorization = parseAuthorizedStart(request.nextUrl.searchParams, env);
    const managerSession = await auth();
    if (!managerSession?.user?.id || !managerSession.identitySessionId) {
      return loginRedirect(request, env.managerUrl);
    }

    const identitySession = await prisma.session.findUnique({
      where: { id: managerSession.identitySessionId },
      select: {
        id: true,
        userId: true,
        authVersion: true,
        expires: true,
        revokedAt: true,
        user: { select: { authVersion: true } }
      }
    });
    const now = new Date();
    if (
      !identitySession ||
      identitySession.userId !== managerSession.user.id ||
      identitySession.authVersion !== managerSession.authVersion ||
      identitySession.user.authVersion !== managerSession.authVersion ||
      identitySession.revokedAt !== null ||
      identitySession.expires <= now
    ) {
      return loginRedirect(request, env.managerUrl);
    }

    const issued = await createAuthorizationCodeService(env).issue({
      audience: authorization.audience,
      clientId: authorization.clientId,
      redirectUri: authorization.redirectUri,
      codeChallenge: authorization.codeChallenge,
      userId: identitySession.userId,
      identitySessionId: identitySession.id,
      identitySessionExpiresAt: Math.floor(identitySession.expires.getTime() / 1_000),
      authVersion: identitySession.authVersion
    });

    return NextResponse.redirect(
      buildAuthorizationCallback(authorization.redirectUri, issued.code, authorization.state),
      { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } }
    );
  } catch (error) {
    const mapped = mapProtocolError(error);
    return noStoreJson(mapped.body, mapped.status);
  }
}
