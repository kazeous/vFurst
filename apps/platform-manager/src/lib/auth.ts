import { PrismaAdapter } from "@auth/prisma-adapter";
import {
  normalizeIdentityEmail,
  verifyPassword
} from "@vfurst/auth/core";
import { prisma } from "@vfurst/db";
import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { cache } from "react";
import { z } from "zod";
import { getPlatformManagerEnv } from "./env.js";
import {
  bindIdentitySessionToJwt,
  IDENTITY_SESSION_MAX_AGE_SECONDS,
  revokeIdentitySession,
  type IdentityJwtClaims
} from "./identity-session.js";
import { MANAGER_SESSION_COOKIE, managerGoogleProviderOptions } from "./auth-policy.js";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1)
});

declare module "next-auth" {
  interface Session {
    identitySessionId: string;
    authVersion: number;
    user: {
      id: string;
      platformRole: "USER" | "PLATFORM_ADMIN";
    } & DefaultSession["user"];
  }
}

export function createManagerAuthConfig(): NextAuthConfig {
  const env = getPlatformManagerEnv();
  const providers: NextAuthConfig["providers"] = [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: normalizeIdentityEmail(parsed.data.email) }
        });
        if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image ?? user.avatar
        };
      }
    })
  ];

  if (env.googleClientId && env.googleClientSecret) {
    providers.push(
      Google(managerGoogleProviderOptions(env.googleClientId, env.googleClientSecret))
    );
  }

  return {
    adapter: PrismaAdapter(prisma),
    secret:
      env.authSecret ??
      (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
        ? "vfurst-manager-local-development-secret"
        : undefined),
    trustHost: true,
    session: {
      strategy: "jwt",
      maxAge: IDENTITY_SESSION_MAX_AGE_SECONDS
    },
    cookies: {
      sessionToken: MANAGER_SESSION_COOKIE
    },
    providers,
    pages: { signIn: "/login" },
    callbacks: {
      async jwt({ token, user }) {
        return bindIdentitySessionToJwt(token, user?.id);
      },
      async session({ session, token }) {
        const identity = token as typeof token & IdentityJwtClaims;
        if (
          !identity.sub ||
          !identity.identitySessionId ||
          identity.identitySessionValid !== true ||
          typeof identity.authVersion !== "number" ||
          !identity.platformRole
        ) {
          return null as never;
        }

        session.user.id = identity.sub;
        session.user.platformRole = identity.platformRole;
        session.identitySessionId = identity.identitySessionId;
        session.authVersion = identity.authVersion;
        return session;
      }
    },
    events: {
      async signOut(message) {
        const identity = "token" in message ? (message.token as IdentityJwtClaims | null) : null;
        if (identity?.identitySessionId) {
          await revokeIdentitySession(identity.identitySessionId);
        }
      }
    }
  };
}

const nextAuth = NextAuth(createManagerAuthConfig());

export const handlers = nextAuth.handlers;
export const signIn = nextAuth.signIn;
export const signOut = nextAuth.signOut;
export const auth = cache(nextAuth.auth);
