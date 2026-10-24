"use client";

import type { ActionFormState } from "@/lib/action-form-state";
import { initialActionFormState } from "@/lib/action-form-state";
import { useActionRedirect } from "@/components/use-action-redirect";
import type { FormEvent, ReactNode } from "react";
import { startTransition, useActionState, useEffect, useRef } from "react";

type ActionStateFormProps = {
  action: (state: ActionFormState, formData: FormData) => Promise<ActionFormState>;
  children: ReactNode;
  className?: string;
  errorTestId?: string;
  id?: string;
  resetOnSuccess?: boolean;
};

export function ActionStateForm({
  action,
  children,
  className,
  errorTestId,
  id,
  resetOnSuccess = false
}: ActionStateFormProps) {
  const [state, dispatch, pending] = useActionState(action, initialActionFormState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state.success) formRef.current?.reset();
  }, [resetOnSuccess, state]);
  useActionRedirect(state.redirectTo);
  const busy = pending || Boolean(state.redirectTo);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  return (
    <form ref={formRef} id={id} action={dispatch} onSubmit={submit} className={className} aria-busy={busy}>
      {state.error ? (
        <div className="vf-banner vf-banner-error" role="alert" data-testid={errorTestId}>
          {state.error}
          {state.verificationUrl ? <a href={state.verificationUrl} target="_blank" rel="noopener noreferrer">Verify your account</a> : null}
        </div>
      ) : null}
      {state.success ? (
        <div className="vf-banner vf-banner-success" role="status">
          {state.success}
        </div>
      ) : null}
      <fieldset className="vf-action-state-fields" disabled={busy}>
        {children}
      </fieldset>
    </form>
  );
}
