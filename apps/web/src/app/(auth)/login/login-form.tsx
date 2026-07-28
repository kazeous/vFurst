"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormLayout } from "@/components/ui/form-layout";
import { TextInput } from "@/components/ui/input";
import { useActionState, useState } from "react";

export type LoginFormState = {
  error?: string;
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
        label={pending ? "Logging in..." : "Log in"}
        type="submit"
        variant="primary"
        disabled={pending}
        aria-describedby={state.error ? "login-error" : undefined}
      />
    </form>
  );
}

