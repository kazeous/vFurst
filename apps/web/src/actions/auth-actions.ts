"use server";

import { prisma } from "@vfurst/db";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeReturnTo } from "@/lib/return-to";

const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("A valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  returnTo: z.string().optional()
});

export async function registerUser(formData: FormData) {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    returnTo: formData.get("returnTo")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid registration details.");
  }

  const email = parsed.data.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({
    where: {
      email
    },
    select: {
      id: true
    }
  });

  if (existingUser) {
    throw new Error("An account already exists for this email address.");
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      passwordHash
    }
  });

  const search = new URLSearchParams({
    registered: "1",
    returnTo: safeReturnTo(parsed.data.returnTo)
  });
  redirect(`/login?${search.toString()}`);
}
