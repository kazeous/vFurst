import { auth } from "@/lib/auth";
import { getCentralLoginUrl } from "@/lib/central-url";
import { prisma } from "@vfurst/db";
import { redirect } from "next/navigation";

export type PublicAccountUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

export async function requirePublicAccount(returnTo = "/account"): Promise<PublicAccountUser> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect(getCentralLoginUrl(returnTo));
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, image: true }
  });

  if (!user) {
    redirect(getCentralLoginUrl(returnTo));
  }

  return user;
}

export function assertPublicAccountEmail(user: Pick<PublicAccountUser, "email">, submittedEmail: string) {
  if (user.email.trim().toLowerCase() !== submittedEmail.trim().toLowerCase()) {
    throw new Error("Use the email address from your signed-in vFurst account.");
  }
}

export async function syncPublicAccountName(user: PublicAccountUser, submittedName: string) {
  const name = submittedName.trim();

  if (!name || name === user.name) {
    return user;
  }

  return prisma.user.update({
    where: { id: user.id },
    data: { name },
    select: { id: true, email: true, name: true, image: true }
  });
}
