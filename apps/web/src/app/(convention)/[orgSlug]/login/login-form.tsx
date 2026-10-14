"use client";

import { useActionState, useState } from "react";
import { portalSignIn, type PortalAuthFormState } from "@/actions/portal-auth-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormLayout } from "@/components/ui/form-layout";
import { TextInput } from "@/components/ui/input";

const initialState: PortalAuthFormState = {};

export function LoginForm({ returnTo }: { returnTo: string }) {
  const [state, formAction, pending] = useActionState(portalSignIn, initialState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="vf-form">
      <input type="hidden" name="returnTo" value={returnTo} />
      <FormLayout>
        <TextInput label="Email" type="email" htmlName="email" autoComplete="email" value={email} onChange={setEmail} isRequired />
        <TextInput label="Password" type="password" htmlName="password" autoComplete="current-password" value={password} onChange={setPassword} isRequired />
      </FormLayout>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      <Button type="submit" variant="primary" disabled={pending}>Sign in</Button>
    </form>
  );
}
