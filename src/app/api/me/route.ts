import { NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await getCurrentSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image
    }
  });
}
