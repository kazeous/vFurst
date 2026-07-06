import { registerUser } from "@/actions/auth-actions";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import Link from "next/link";

export default function RegisterPage() {
  return (
    <Card className="vf-auth-card" maxWidth={440}>
      <div className="vf-stack">
        <div>
          <p className="vf-label">Start organizing</p>
          <h1>Create your account</h1>
        </div>
        <form action={registerUser} className="vf-form">
          <label>
            Name
            <input name="name" type="text" autoComplete="name" required />
          </label>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <Button label="Create account" type="submit" variant="primary" />
        </form>
        <p className="vf-muted">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </div>
    </Card>
  );
}

