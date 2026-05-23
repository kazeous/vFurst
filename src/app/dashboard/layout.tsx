import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";

export default async function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getCurrentSession();

  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  return <main className="mx-auto min-h-[calc(100vh-73px)] max-w-6xl px-6 py-8">{children}</main>;
}
