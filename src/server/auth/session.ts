import "server-only";
import type { Session } from "next-auth";
import { auth } from "@/server/auth";
import { unauthorized } from "@/server/http";

export async function getCurrentSession() {
  return auth();
}

export async function requireSession(): Promise<Session> {
  const session = await getCurrentSession();

  if (!session?.user) {
    unauthorized();
  }

  return session as Session;
}
