"use client";

import { useActionState, useEffect, useState } from "react";
import { portalRequestPasswordReset, type PortalAuthFormState } from "@/actions/portal-auth-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormLayout } from "@/components/ui/form-layout";
import { TextInput } from "@/components/ui/input";

const initialState: PortalAuthFormState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(portalRequestPasswordReset, initialState);
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (state.redirectTo) window.location.replace(state.redirectTo);
  }, [state.redirectTo]);

  return (
    <form action={formAction} className="vf-form">
      <FormLayout>
        <TextInput label="Email" type="email" htmlName="email" autoComplete="email" value={email} onChange={setEmail} isRequired />
      </FormLayout>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.sent ? <Alert variant="success">Check your email. If this address can be used here, we sent a link that expires in one hour.</Alert> : null}
      <Button type="submit" variant="primary" disabled={pending || Boolean(state.redirectTo)}>Send link</Button>
    </form>
  );
}
