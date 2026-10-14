"use client";

import { useActionState, useState } from "react";
import { portalSignUp, type PortalAuthFormState } from "@/actions/portal-auth-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormLayout } from "@/components/ui/form-layout";
import { TextInput } from "@/components/ui/input";

const initialState: PortalAuthFormState = {};

export function SignupForm({ returnTo }: { returnTo: string }) {
  const [state, formAction, pending] = useActionState(portalSignUp, initialState);
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} className="vf-form">
      <input type="hidden" name="returnTo" value={returnTo} />
      <FormLayout>
        <TextInput label="Email" type="email" htmlName="email" autoComplete="email" value={email} onChange={setEmail} isRequired />
      </FormLayout>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.sent ? <Alert variant="success">Check your email. If this address can be used here, we sent a link that expires in one hour.</Alert> : null}
      <Button type="submit" variant="primary" disabled={pending}>Create account</Button>
    </form>
  );
}
