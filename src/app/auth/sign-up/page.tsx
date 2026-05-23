import Link from "next/link";

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-normal">Create account</h1>
        <p className="text-muted-foreground">
          Account creation will be implemented with the organization invite and RBAC work. Phase 1 only establishes the
          secure app foundation.
        </p>
      </div>
      <Link className="text-sm font-medium text-primary" href="/auth/sign-in">
        Go to sign in
      </Link>
    </main>
  );
}
