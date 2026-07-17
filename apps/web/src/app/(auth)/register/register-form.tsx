"use client";

import type { RegisterUserState } from "@/actions/auth-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormLayout } from "@/components/ui/form-layout";
import { TextInput } from "@/components/ui/input";
import Link from "next/link";
import { useActionState, useState } from "react";

const initialState: RegisterUserState = {};

export function RegisterForm({
  action,
  returnTo
}: {
  action: (previousState: RegisterUserState, formData: FormData) => Promise<RegisterUserState>;
  returnTo: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="vf-form">
      <input type="hidden" name="returnTo" value={returnTo} />
      <FormLayout>
        <TextInput label="Name" htmlName="name" value={name} onChange={setName} hasAutoFocus isRequired />
        <TextInput label="Email" type="email" htmlName="email" value={email} onChange={setEmail} isRequired />
        <TextInput
          label="Password"
          type="password"
          htmlName="password"
          value={password}
          onChange={setPassword}
          isRequired
        />
      </FormLayout>
      {state.error ? (
        <Alert id="register-error" data-testid="register-error" variant="error">
          <p>{state.error}</p>
          {state.reason === "account_exists" ? (
            <p>
              <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>Log in</Link> or{" "}
              <Link href={`/forgot-password?returnTo=${encodeURIComponent(returnTo)}`}>reset your password</Link>.
            </p>
          ) : null}
        </Alert>
      ) : null}
      <Button
        label={pending ? "Creating account..." : "Create account"}
        type="submit"
        variant="primary"
        disabled={pending}
        aria-describedby={state.error ? "register-error" : undefined}
      />
    </form>
  );
}
