"use client";

import { createApiKey, type CreateApiKeyState } from "@/actions/saas-actions";
import { Button } from "@/components/ui/button";
import { useActionState } from "react";

const scopes = [
  ["read:events", "Events"],
  ["read:registrations", "Registrations"],
  ["read:attendees", "Attendees"],
  ["read:vendors", "Vendors"],
  ["read:store", "Store"],
  ["read:badges", "Badges"]
] as const;

const initialState: CreateApiKeyState = {};

export function ApiKeyCreateForm({ orgId }: { orgId: string }) {
  const [state, action, pending] = useActionState(createApiKey, initialState);

  return (
    <form action={action} className="vf-form">
      <input type="hidden" name="orgId" value={orgId} />
      <h2>Create key</h2>
      <label>
        Name
        <input name="name" placeholder="Reporting integration" required />
      </label>
      <fieldset className="vf-fieldset">
        <legend>Scopes</legend>
        {scopes.map(([value, label]) => (
          <label key={value} className="vf-check">
            <input name="scopes" type="checkbox" value={value} defaultChecked={value === "read:events"} />
            {label}
          </label>
        ))}
      </fieldset>
      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.token ? (
        <div className="vf-banner vf-banner-success" data-created-api-key="true" role="status">
          <strong>Copy this API key now. It will not be shown again.</strong>
          <code>{state.token}</code>
        </div>
      ) : null}
      <Button label={pending ? "Creating..." : "Create API key"} type="submit" variant="primary" disabled={pending} />
    </form>
  );
}
