import { registerUser } from "@/actions/auth-actions";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { safeReturnTo } from "@/lib/return-to";
import { RegisterForm } from "./register-form";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo);

  return (
    <Card className="vf-auth-card" maxWidth={440}>
      <div className="vf-stack">
        <div>
          <p className="vf-label">Public account</p>
          <h1>Create your account</h1>
        </div>
        <RegisterForm action={registerUser} returnTo={returnTo} />
        <p className="vf-muted">
          Already have an account? <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>Log in</Link>
        </p>
      </div>
    </Card>
  );
}
