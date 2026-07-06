import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@vfurst/db";
import bcrypt from "bcryptjs";
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
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
        role: string;
      }>;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
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
      }

      return token;
    },
    async session({ session, token }) {
      if (!token.sub) {
        return session;
      }

      const memberships = await prisma.orgMember.findMany({
        where: {
          userId: token.sub
        },
        include: {
          org: {
            select: {
              id: true,
              slug: true,
              name: true
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      });

      session.user.id = token.sub;
      session.user.orgMemberships = memberships.map((membership) => ({
        orgId: membership.org.id,
        orgSlug: membership.org.slug,
        orgName: membership.org.name,
        role: membership.role
      }));

      return session;
    }
  }
});
