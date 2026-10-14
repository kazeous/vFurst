"use client";

import { useActionState, useEffect } from "react";
import { portalSignOut, type PortalAuthFormState } from "@/actions/portal-auth-actions";
import { Button } from "@/components/ui/button";

const initialState: PortalAuthFormState = {};

export function SignOutForm() {
  const [state, formAction, pending] = useActionState(portalSignOut, initialState);

  useEffect(() => {
    if (state.redirectTo) window.location.replace(state.redirectTo);
  }, [state.redirectTo]);

  return (
    <form action={formAction}>
      <Button type="submit" disabled={pending || Boolean(state.redirectTo)}>Sign out</Button>
    </form>
  );
}
