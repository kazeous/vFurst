import { getCurrentSession } from "@/server/auth/session";

export default async function DashboardPage() {
  const session = await getCurrentSession();

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">Protected area</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">Dashboard shell</h1>
      </div>
      <div className="rounded-md border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          Signed in as {session?.user?.email ?? session?.user?.name ?? "authenticated user"}.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Organization and event dashboards will be added in later phases after server-side RBAC is implemented.
        </p>
      </div>
    </section>
  );
}
