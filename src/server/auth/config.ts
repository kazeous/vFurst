import "server-only";
import type { NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { verifyPassword } from "@/server/password";
import { ROUTES } from "@/shared/routes";
import { signInInputSchema } from "@/shared/schemas/auth";

export const authConfig = {
  adapter: PrismaAdapter(db),
  secret: env.AUTH_SECRET,
  trustHost: true,
  pages: {
    signIn: ROUTES.signIn
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const parsed = signInInputSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        const user = await db.user.findUnique({
          where: { email: parsed.data.email }
        });

        if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image
        };
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? token.sub);
      }

      return session;
    }
  }
} satisfies NextAuthConfig;
