import "server-only";
import { auth } from "@/server/auth";

export async function getCurrentSession() {
  return auth();
}

export async function requireSession() {
  const session = await getCurrentSession();

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  return session;
}
