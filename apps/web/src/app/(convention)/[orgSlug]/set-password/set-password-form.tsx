"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { portalSetPassword, type PortalAuthFormState } from "@/actions/portal-auth-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormLayout } from "@/components/ui/form-layout";
import { TextInput } from "@/components/ui/input";

const initialState: PortalAuthFormState = {};

export function SetPasswordForm({ token, returnTo, name: initialName, heading }: {
  token: string;
  returnTo: string;
  name: string;
  heading: string | null;
}) {
  const [state, formAction, pending] = useActionState(portalSetPassword, initialState);
  const [name, setName] = useState(initialName);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (state.redirectTo) window.location.replace(state.redirectTo);
  }, [state.redirectTo]);

  if (!heading) {
    return (
      <>
        <Alert variant="error">This link is invalid, expired, or has already been used.</Alert>
        <Link href="/forgot-password">Request a new link</Link>
      </>
    );
  }

  return (
    <>
      <h1>{heading}</h1>
      <form action={formAction} className="vf-form">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <FormLayout>
          <TextInput label="Name" htmlName="name" autoComplete="name" value={name} onChange={setName} isRequired />
          <TextInput label="New password" type="password" htmlName="password" autoComplete="new-password" minLength={8} value={password} onChange={setPassword} isRequired />
          <TextInput label="Confirm password" type="password" htmlName="confirmPassword" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={setConfirmPassword} isRequired />
        </FormLayout>
        {state.error ? <Alert variant="error">{state.error}</Alert> : null}
        <Button type="submit" variant="primary" disabled={pending || Boolean(state.redirectTo)}>Save password</Button>
      </form>
    </>
  );
}
