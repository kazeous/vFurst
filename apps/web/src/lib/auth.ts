import { PrismaAdapter } from "@auth/prisma-adapter";
import { normalizeIdentityEmail, verifyPassword } from "@vfurst/auth/core";
import { prisma } from "@vfurst/db";
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { cache } from "react";
import { z } from "zod";
import {
  bindIdentitySessionToJwt,
  IDENTITY_SESSION_MAX_AGE_SECONDS,
  revokeIdentitySession,
  type IdentityJwtClaims
} from "@/lib/identity-session";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

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
  adapter: PrismaAdapter(prisma),
  secret: process.env.AUTH_SECRET ?? (process.env.NODE_ENV === "development" ? "vfurst-local-development-secret" : undefined),
  session: {
    strategy: "jwt",
    maxAge: IDENTITY_SESSION_MAX_AGE_SECONDS
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {}
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: {
            email: normalizeIdentityEmail(parsed.data.email)
          }
        });

        if (!user?.passwordHash) {
          return null;
        }

        const isValid = await verifyPassword(parsed.data.password, user.passwordHash);

        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image ?? user.avatar
        };
      }
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true
    })
  ],
  pages: {
    signIn: "/login"
  },
  callbacks: {
    async jwt({ token, user }) {
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
