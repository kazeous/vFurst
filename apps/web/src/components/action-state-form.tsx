"use client";

import type { ActionFormState } from "@/lib/action-form-state";
import { initialActionFormState } from "@/lib/action-form-state";
import type { FormEvent, ReactNode } from "react";
import { startTransition, useActionState } from "react";

type ActionStateFormProps = {
  action: (state: ActionFormState, formData: FormData) => Promise<ActionFormState>;
  children: ReactNode;
  className?: string;
  errorTestId?: string;
  id?: string;
};

export function ActionStateForm({
  action,
  children,
  className,
  errorTestId,
  id
}: ActionStateFormProps) {
  const [state, dispatch, pending] = useActionState(action, initialActionFormState);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  return (
    <form id={id} action={dispatch} onSubmit={submit} className={className} aria-busy={pending}>
      {state.error ? (
        <div className="vf-banner vf-banner-error" role="alert" data-testid={errorTestId}>
          {state.error}
        </div>
      ) : null}
      {state.success ? (
        <div className="vf-banner vf-banner-success" role="status">
          {state.success}
        </div>
      ) : null}
      <fieldset className="vf-action-state-fields" disabled={pending}>
        {children}
      </fieldset>
    </form>
  );
}
