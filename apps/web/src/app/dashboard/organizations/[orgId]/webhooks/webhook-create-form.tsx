"use client";

import {
  createWebhookEndpoint,
  type CreateWebhookEndpointState
} from "@/actions/saas-actions";
import { Button } from "@/components/ui/button";
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhook-events";
import { useActionState } from "react";

const initialState: CreateWebhookEndpointState = {};

export function WebhookCreateForm({ orgId }: { orgId: string }) {
  const [state, action, pending] = useActionState(createWebhookEndpoint, initialState);

  return (
    <form action={action} className="vf-form">
      <input type="hidden" name="orgId" value={orgId} />
      <h2>Add endpoint</h2>
      <label>
        Endpoint URL
        <input name="url" type="url" placeholder="https://example.com/vfurst/webhook" required />
        <small>Use a public HTTPS DNS endpoint. Private-network targets and redirects are rejected.</small>
      </label>
      <label>
        Signing secret
        <input
          name="secret"
          type="password"
          autoComplete="new-password"
          minLength={24}
          placeholder="Generated automatically if blank"
        />
      </label>
      <fieldset className="vf-fieldset">
        <legend>Events</legend>
        {WEBHOOK_EVENT_TYPES.map((event) => (
          <label key={event} className="vf-check">
            <input
              name="events"
              type="checkbox"
              value={event}
              defaultChecked={event === "registration.created" || event === "order.paid"}
            />
            {event}
          </label>
        ))}
      </fieldset>
      <label className="vf-check">
        <input name="active" type="checkbox" defaultChecked />
        Active
      </label>
      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.secret ? (
        <div className="vf-banner vf-banner-success" data-created-webhook-secret="true" role="status">
          <strong>Copy this signing secret now. It will not be shown again.</strong>
          <code>{state.secret}</code>
        </div>
      ) : null}
      <Button label={pending ? "Saving..." : "Save endpoint"} type="submit" variant="primary" disabled={pending} />
    </form>
  );
}
