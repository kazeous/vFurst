import * as Sentry from "@sentry/nextjs";
import { prisma } from "@vfurst/db";
import NextAuth, { type DefaultSession } from "next-auth";
import Authentik from "next-auth/providers/authentik";
import { cache } from "react";
import {
  bindIdentitySessionToJwt,
  IDENTITY_SESSION_MAX_AGE_SECONDS,
  revokeIdentitySession,
  type IdentityJwtClaims
} from "@/lib/identity-session";
import {
  createStaffAdapter,
  findStaffEmailConflict,
  parseStaffClaims,
  STAFF_IDENTITY_PROVIDER,
  syncStaffUser
} from "@/lib/staff-identity";

declare module "next-auth" {
  interface Session {
    identitySessionId: string;
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
  // Staff sign in only through the studio authentik over OIDC (spec §6.1).
  providers: [
    Authentik({
      issuer: process.env.AUTH_AUTHENTIK_ISSUER,
      clientId: process.env.AUTH_AUTHENTIK_ID,
      clientSecret: process.env.AUTH_AUTHENTIK_SECRET,
      checks: ["pkce", "state"],
      authorization: { params: { scope: "openid email profile" } }
    })
  ],
  pages: {
    signIn: "/login",
    // Auth.js error codes render inline on /login (spec §6.6).
    error: "/login"
  },
  callbacks: {
    async signIn({ account, profile }) {
      const claims = account?.provider === STAFF_IDENTITY_PROVIDER ? parseStaffClaims(profile) : null;
      if (!claims) return false;

      const conflict = await findStaffEmailConflict(claims);
      if (conflict) {
        // No automatic linking by email (spec §6.2). Report both user ids, never tokens.
        Sentry.captureMessage("Studio account email conflict", { level: "warning", extra: conflict });
        return "/login?error=StudioAccountConflict";
      }

      return true;
    },
    async jwt({ token, user, account, profile }) {
      if (user?.id && account?.provider === STAFF_IDENTITY_PROVIDER) {
        const claims = parseStaffClaims(profile);
        if (claims) {
          // Sync before the identity session is issued, so a role change applies at once.
          await syncStaffUser(user.id, claims);
          return bindIdentitySessionToJwt(token, user.id, undefined, {
            sid: claims.sid,
            idToken: account.id_token ?? null
          });
        }
      }

      return bindIdentitySessionToJwt(token, user?.id);
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

      return session;
    }
  },
  events: {
    async signOut(message) {
      const identityToken = "token" in message ? (message.token as IdentityJwtClaims | null) : null;
      if (identityToken?.identitySessionId) {
        await revokeIdentitySession(identityToken.identitySessionId);
      }
    }
  }
});

export const handlers = nextAuth.handlers;
export const signIn = nextAuth.signIn;
export const signOut = nextAuth.signOut;
export const auth = cache(nextAuth.auth);
