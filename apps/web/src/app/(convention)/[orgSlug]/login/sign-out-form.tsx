"use client";

import { useActionState, useEffect } from "react";
import { portalSignOut, type PortalAuthFormState } from "@/actions/portal-auth-actions";
import { Button } from "@/components/ui/button";

const initialState: PortalAuthFormState = {};

export function SignOutForm({ email }: { email: string | null }) {
  const [state, formAction, pending] = useActionState(portalSignOut, initialState);

  useEffect(() => {
    if (state.redirectTo) window.location.replace(state.redirectTo);
  }, [state.redirectTo]);

  if (email === null) return null;

  return (
    <>
      <p>Signed in as {email}</p>
      <form action={formAction}>
        <Button type="submit" disabled={pending || Boolean(state.redirectTo)}>Sign out</Button>
      </form>
    </>
  );
}
