import "server-only";
import type { NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { ROUTES } from "@/shared/routes";

export const authConfig = {
  adapter: PrismaAdapter(db),
  secret: env.AUTH_SECRET,
  trustHost: true,
  pages: {
    signIn: ROUTES.signIn
  },
  providers: [],
  session: {
    strategy: "database"
  },
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }

      return session;
    }
  }
} satisfies NextAuthConfig;
