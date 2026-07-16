import { resetPassword } from "@/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { safeReturnTo } from "@/lib/return-to";

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ invalid?: string; returnTo?: string | string[]; token?: string }>;
}) {
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo, "/account");

  return (
    <Card className="vf-auth-card" maxWidth={440}>
      <div className="vf-stack">
        <div>
          <p className="vf-label">Account recovery</p>
          <h1>Choose a new password</h1>
        </div>
        {query.invalid || !query.token ? (
          <div className="vf-stack">
            <Alert variant="warning">This reset link is invalid, expired, or has already been used.</Alert>
            <Button label="Request another link" href={`/forgot-password?returnTo=${encodeURIComponent(returnTo)}`} variant="primary" />
          </div>
        ) : (
          <form action={resetPassword} className="vf-form">
            <input type="hidden" name="token" value={query.token} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <label>
              New password
              <input name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus />
            </label>
            <label>
              Confirm password
              <input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
            </label>
            <Button label="Update password" type="submit" variant="primary" />
          </form>
        )}
        <p className="vf-muted"><Link href="/login">Back to login</Link></p>
      </div>
    </Card>
  );
}
