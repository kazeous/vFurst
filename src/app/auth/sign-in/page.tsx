import Link from "next/link";
import { SignInForm } from "@/features/auth/sign-in-form";

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-normal">Sign in</h1>
        <p className="text-muted-foreground">Use your VFurst account to manage organizations and events.</p>
      </div>
      <SignInForm />
      <Link className="text-sm font-medium text-primary" href="/">
        Back to home
      </Link>
    </main>
  );
}
