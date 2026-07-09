import { registerUser } from "@/actions/auth-actions";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <Card className="vf-auth-card" maxWidth={440}>
      <div className="vf-stack">
        <div>
          <p className="vf-label">Start organizing</p>
          <h1>Create your account</h1>
        </div>
        <RegisterForm action={registerUser} />
        <p className="vf-muted">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </div>
    </Card>
  );
}
