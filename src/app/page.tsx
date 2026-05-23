import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-73px)] max-w-6xl content-center gap-8 px-6 py-16">
      <section className="max-w-3xl space-y-5">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">Phase 1 foundation</p>
        <h1 className="text-4xl font-semibold tracking-normal text-foreground md:text-6xl">
          Event operations, built on a clean server boundary.
        </h1>
        <p className="text-lg leading-8 text-muted-foreground">
          VFurst is being built as an original SaaS platform for conventions, fairs, conferences, and community
          events. This first phase establishes the application shell, Auth.js scaffolding, Prisma schema, and protected
          server routes.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground" href="/dashboard">
            Open dashboard
          </Link>
          <Link className="rounded-md border px-4 py-2 font-medium" href="/api/health">
            Check health
          </Link>
        </div>
      </section>
    </main>
  );
}
