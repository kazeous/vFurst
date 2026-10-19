import * as Sentry from "@sentry/nextjs";
import { prisma } from "@vfurst/db";
import NextAuth, { AuthError, customFetch, type DefaultSession } from "next-auth";
import Authentik from "next-auth/providers/authentik";
import { cache } from "react";
import {
  bindIdentitySessionToJwt,
  IDENTITY_SESSION_MAX_AGE_SECONDS,
  type IdentityJwtClaims,
  type StaffSessionSecurity
} from "@/lib/identity-session";
import {
  createStaffAdapter,
  findStaffEmailConflict,
  parseStaffClaims,
  STAFF_IDENTITY_PROVIDER,
} from "@/lib/staff-identity";
import { staffOidcFetch, verifyStaffIdentityToken } from "@/lib/staff-oidc";
import { beginStaffOidcFlow, clearStaffOidcFlow, currentStaffOidcTransaction, currentStaffOidcFlowHash } from "@/lib/staff-oidc-flow";
import { completeStaffOidcTransaction, endStaffBrowserSessions, type StaffOidcPurpose } from "@/lib/staff-oidc-store";
import { assertStaffStepUp, StaffIdentityError, staffOidcCookiePolicy } from "@/lib/staff-session-policy";
import { getCentralAppUrl } from "@/lib/central-url";
import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { applyFixedWindowRateLimit, getClientIpFromHeaders, AUTH_RATE_LIMIT_PER_MINUTE, RATE_LIMIT_WINDOW_MS, RateLimitUnavailableError } from "@/lib/rate-limit";
import { safeReturnTo } from "@/lib/return-to";
import { staffAuthErrorRecord } from "@/lib/staff-auth-log";

declare module "next-auth" {
  interface Session {
    identitySessionId: string;
    authVersion: number;
    staffSecurity: StaffSessionSecurity;
    user: {
      id: string;
      platformRole: "USER" | "PLATFORM_ADMIN";
    } & DefaultSession["user"];
  }
}

const nextAuth = NextAuth({
  adapter: createStaffAdapter(prisma),
  secret: process.env.AUTH_SECRET ?? (process.env.NODE_ENV === "development" ? "vfurst-local-development-secret" : undefined),
  session: {
    strategy: "jwt",
    maxAge: IDENTITY_SESSION_MAX_AGE_SECONDS
  },
  cookies: staffOidcCookiePolicy(getCentralAppUrl()),
  // Staff sign in only through the studio authentik over OIDC (spec §6.1).
  providers: [
    Authentik({
      issuer: process.env.AUTH_AUTHENTIK_ISSUER,
      clientId: process.env.AUTH_AUTHENTIK_ID,
      clientSecret: process.env.AUTH_AUTHENTIK_SECRET,
      checks: ["pkce", "state", "nonce"],
      client: { token_endpoint_auth_method: "client_secret_post", id_token_signed_response_alg: "RS256" },
      [customFetch]: staffOidcFetch,
      authorization: { params: { scope: "openid email profile vfurst_assurance" } },
      profile(profile) {
        const claims = parseStaffClaims(profile);
        if (!claims) throw new StaffIdentityError("InvalidIdentity");
        return { id: claims.sub, email: claims.email, name: claims.name, image: claims.image };
      }
    })
  ],
  pages: {
    signIn: "/login",
    // Auth.js error codes render inline on /login (spec §6.6).
    error: "/login"
  },
  logger: {
    error(error) { console.error(staffAuthErrorRecord(error)); }
  },
  callbacks: {
    async signIn({ account }) {
      if (account?.provider !== STAFF_IDENTITY_PROVIDER || !account.id_token) return false;
      const flow = await currentStaffOidcTransaction();
      if (!flow) return "/login?error=SessionRevoked";
      let claims;
      try {
        const verified = await verifyStaffIdentityToken(account.id_token);
        claims = verified.claims;
        if (flow.purpose === "step-up") assertStaffStepUp(verified.assurance, flow.createdAt);
        if (flow.purpose !== "login") {
          const linked = await prisma.account.findUnique({
            where: { provider_providerAccountId: { provider: STAFF_IDENTITY_PROVIDER, providerAccountId: claims.sub } }, select: { userId: true }
          });
          if (linked?.userId !== flow.userId) throw new StaffIdentityError("ActorChanged");
        }
      } catch (error) {
        const code = error instanceof StaffIdentityError ? error.code : "InvalidIdentity";
        return `/login?error=${code}`;
      }

      const conflict = await findStaffEmailConflict(claims);
      if (conflict) {
        // No automatic linking by email (spec §6.2). Report both user ids, never tokens.
        Sentry.captureMessage("Studio account email conflict", { level: "warning", extra: conflict });
        return "/login?error=StudioAccountConflict";
      }

      return true;
    },
    async jwt({ token, user, account }) {
      if (user?.id && account?.provider === STAFF_IDENTITY_PROVIDER) {
        try {
          const flow = await currentStaffOidcTransaction();
          if (!flow || !account.id_token) return null;
          const verified = await verifyStaffIdentityToken(account.id_token);
          const identity = await completeStaffOidcTransaction({
            transaction: flow, userId: user.id, ...verified,
            clientId: process.env.AUTH_AUTHENTIK_ID ?? "", idToken: account.id_token
          });
          const bound = await bindIdentitySessionToJwt({ ...token, sub: identity.userId, authVersion: identity.authVersion, identitySessionId: identity.identitySessionId });
          return bound.identitySessionValid ? bound : null;
        } finally { await clearStaffOidcFlow(); }
      }
      const bound = await bindIdentitySessionToJwt(token);
      // Returning null also clears the rejected JWT cookie. Returning a marked
      // token alone makes Auth.js renew that cookie despite a null session.
      return bound.identitySessionValid ? bound : null;
    },
    async session({ session, token }) {
      const identityToken = token as typeof token & IdentityJwtClaims;
      if (
        !identityToken.sub ||
        !identityToken.identitySessionId ||
        identityToken.identitySessionValid !== true ||
        !identityToken.platformRole
      ) {
        return null as never;
      }

      session.user.id = identityToken.sub;
      session.user.platformRole = identityToken.platformRole;
      session.identitySessionId = identityToken.identitySessionId;
      session.authVersion = identityToken.authVersion!;
      session.staffSecurity = identityToken.staffSecurity!;
      Object.assign(session, { expires: identityToken.staffSecurity!.expiresAt });

      return session;
    }
  },
  events: {
    async signOut(message) {
      const identityToken = "token" in message ? (message.token as IdentityJwtClaims | null) : null;
      // Include a pending/completed browser flow even if IdP logout already
      // invalidated the JWT. Both logout surfaces fence the issued replacement.
      await endStaffBrowserSessions({
        actor: identityToken?.identitySessionId && identityToken.sub
          ? { userId: identityToken.sub, sessionId: identityToken.identitySessionId } : null,
        flowHash: await currentStaffOidcFlowHash(), everywhere: false,
        issuer: process.env.AUTH_AUTHENTIK_ISSUER!, clientId: process.env.AUTH_AUTHENTIK_ID!
      });
      await clearStaffOidcFlow();
    }
  }
});

export const handlers = nextAuth.handlers;
export const signOut = nextAuth.signOut;
export const getStaffSession = cache(nextAuth.auth);
export const auth = cache(async () => {
  const session = await getStaffSession();
  return session?.user?.id && session.staffSecurity && !session.staffSecurity.leaseRequired ? session : null;
});

export async function signIn(provider: "authentik", options: { redirectTo?: string; purpose?: StaffOidcPurpose } = {}) {
  const returnTo = safeReturnTo(options.redirectTo ?? "/dashboard");
  try {
    const rate = await applyFixedWindowRateLimit({
      namespace: "staff-signin", key: getClientIpFromHeaders(await headers()), limit: AUTH_RATE_LIMIT_PER_MINUTE, windowMs: RATE_LIMIT_WINDOW_MS
    });
    if (rate.limited) redirect(`/login?error=ProviderUnavailable&returnTo=${encodeURIComponent(returnTo)}`);
    const purpose = options.purpose ?? "login";
    const session = purpose === "login" ? null : await getStaffSession();
    await beginStaffOidcFlow({
      purpose, returnTo,
      ...(session?.user?.id ? { actor: { userId: session.user.id, sessionId: session.identitySessionId, authVersion: session.authVersion } } : {})
    });
    return await nextAuth.signIn(provider, { redirectTo: returnTo },
      purpose === "lease" ? { prompt: "none" } : purpose === "step-up" ? { prompt: "login", max_age: "10" } : {});
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AuthError || error instanceof StaffIdentityError || error instanceof RateLimitUnavailableError) {
      redirect(`/login?error=${error instanceof StaffIdentityError ? error.code : "ProviderUnavailable"}&returnTo=${encodeURIComponent(returnTo)}`);
    }
    throw error;
  }
}
