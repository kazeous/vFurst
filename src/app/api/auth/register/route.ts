import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { handleRouteError, parseJsonBody } from "@/server/http";
import { hashPassword } from "@/server/password";
import { registerInputSchema } from "@/shared/schemas/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, registerInputSchema);
    const existing = await db.user.findUnique({
      where: { email: input.email },
      select: { id: true }
    });

    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const passwordHash = await hashPassword(input.password);

    const user = await db.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
