"use server";

import { requirePublicAccount } from "@/lib/public-account";
import { prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export async function updatePublicProfile(formData: FormData) {
  const user = await requirePublicAccount("/account/profile");
  const name = z.string().trim().min(1).max(120).parse(formData.get("name"));

  await prisma.user.update({
    where: { id: user.id },
    data: { name }
  });

  revalidatePath("/account");
  revalidatePath("/account/profile");
}
