"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormLayout } from "@/components/ui/form-layout";
import { TextInput } from "@/components/ui/input";
import { useActionState, useEffect, useState } from "react";

export type LoginFormState = {
  error?: string;
  redirectTo?: string;
};

const initialState: LoginFormState = {};

export function LoginForm({
  action
}: {
  action: (previousState: LoginFormState, formData: FormData) => Promise<LoginFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigating = Boolean(state.redirectTo);

  useEffect(() => {
    if (state.redirectTo) {
      // Start a new document request after Auth.js writes the session cookie.
      // A soft App Router transition can otherwise reuse the pre-login RSC tree.
      window.location.replace(state.redirectTo);
    }
  }, [state.redirectTo]);

  return (
    <form action={formAction} className="vf-form">
      <FormLayout>
        <TextInput
          label="Email"
          type="email"
          htmlName="email"
          value={email}
          onChange={setEmail}
          hasAutoFocus
          isRequired
        />
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
        <Alert id="login-error" data-testid="login-error" variant="error">
          {state.error}
        </Alert>
      ) : null}
      <Button
        label={navigating ? "Opening workspace..." : pending ? "Logging in..." : "Log in"}
        type="submit"
        variant="primary"
        disabled={pending || navigating}
        aria-describedby={state.error ? "login-error" : undefined}
      />
    </form>
  );
}

