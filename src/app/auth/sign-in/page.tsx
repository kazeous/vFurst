import Link from "next/link";

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-normal">Sign in</h1>
        <p className="text-muted-foreground">
          Authentication is scaffolded with Auth.js and Prisma. Login providers will be connected in the dedicated auth
          phase.
        </p>
      </div>
      <div className="rounded-md border bg-card p-5 text-sm text-muted-foreground">
        No sign-in provider is enabled in Phase 1. This avoids adding temporary or fake account behavior before the RBAC
        and invite model exists.
      </div>
      <Link className="text-sm font-medium text-primary" href="/">
        Back to home
      </Link>
    </main>
  );
}
