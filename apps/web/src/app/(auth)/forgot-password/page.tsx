import { requestPasswordReset } from "@/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { safeReturnTo } from "@/lib/return-to";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[]; sent?: string }> }) {
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo, "/dashboard");

  return (
    <Card className="vf-auth-card" maxWidth={440}>
      <div className="vf-stack">
        <div>
          <p className="vf-label">Account recovery</p>
          <h1>Reset your password</h1>
          <p className="vf-muted">This also activates access for attendee records created before public accounts were required.</p>
        </div>
        {query.sent ? (
          <Alert variant="success">If an account exists for that email, a one-hour reset link has been sent.</Alert>
        ) : (
          <form action={requestPasswordReset} className="vf-form">
            <input type="hidden" name="returnTo" value={returnTo} />
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required autoFocus />
            </label>
            <Button label="Send reset link" type="submit" variant="primary" />
          </form>
        )}
        <p className="vf-muted"><Link href="/login">Back to login</Link></p>
      </div>
    </Card>
  );
}
