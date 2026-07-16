import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma, type CurrencyCode, type OrganizationStatus } from "@vfurst/db";
import bcrypt from "bcryptjs";
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { cache } from "react";
import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      orgMemberships: Array<{
        orgId: string;
        orgSlug: string;
        orgName: string;
        orgLogo: string | null;
        orgStatus: OrganizationStatus;
        role: string;
        events: Array<{
          id: string;
          name: string;
          status: string;
          startDate: string;
          currency: CurrencyCode;
        }>;
      }>;
      platformRole: "USER" | "PLATFORM_ADMIN";
    } & DefaultSession["user"];
  }
}

const nextAuth = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: process.env.AUTH_SECRET ?? (process.env.NODE_ENV === "development" ? "vfurst-local-development-secret" : undefined),
  session: {
    strategy: "jwt"
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
            email: parsed.data.email.toLowerCase()
          }
        });

        if (!user?.passwordHash) {
          return null;
        }

        const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);

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
      if (user) {
        token.sub = user.id;
        const account = await prisma.user.findUnique({ where: { id: user.id }, select: { authVersion: true } });
        token.authVersion = account?.authVersion ?? 0;
      }

      return token;
    },
    async session({ session, token }) {
      if (!token.sub) {
        return session;
      }

      const user = await prisma.user.findUnique({
        where: {
          id: token.sub
        },
        select: {
          authVersion: true,
          platformRole: true,
          orgMemberships: {
            orderBy: {
              createdAt: "asc"
            },
            select: {
              role: true,
              org: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  logo: true,
                  status: true,
                  events: {
                    orderBy: {
                      startDate: "desc"
                    },
                    select: {
                      id: true,
                      name: true,
                      status: true,
                      startDate: true,
                      currency: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!user || token.authVersion !== user.authVersion) {
        // Auth.js JWT sessions are otherwise valid until cookie expiry. Returning
        // a null session makes every token issued before a password reset
        // unauthorized without adding another database read to each request.
        return null as never;
      }

      session.user.id = token.sub;
      session.user.platformRole = user?.platformRole ?? "USER";
      session.user.orgMemberships = (user?.orgMemberships ?? []).map((membership) => ({
        orgId: membership.org.id,
        orgSlug: membership.org.slug,
        orgName: membership.org.name,
        orgLogo: membership.org.logo,
        orgStatus: membership.org.status,
        role: membership.role,
        events: membership.org.events.map((event) => ({
          ...event,
          startDate: event.startDate.toISOString()
        }))
      }));

      return session;
    }
  }
});

export const handlers = nextAuth.handlers;
export const signIn = nextAuth.signIn;
export const signOut = nextAuth.signOut;
export const auth = cache(nextAuth.auth);
