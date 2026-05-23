import Link from "next/link";
import { SignUpForm } from "@/features/auth/sign-up-form";

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-normal">Create account</h1>
        <p className="text-muted-foreground">Create an account before accepting invites or creating organizations.</p>
      </div>
      <SignUpForm />
      <Link className="text-sm font-medium text-primary" href="/auth/sign-in">
        Go to sign in
      </Link>
    </main>
  );
}
