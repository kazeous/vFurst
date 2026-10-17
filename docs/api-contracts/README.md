# API Contracts

Phase 0 defines the public contract surface before implementation. The REST
OpenAPI document and webhook schemas are intentionally versioned here so later
phases can implement endpoints without changing their external shape casually.

- `openapi.yaml` - REST API contract for v1 organization, event, registration,
  order, and platform integration resources.
- `webhooks.yaml` - outbound webhook event envelope and Phase 0 event catalog.

These documents are contracts only; Phase 0 does not implement the API routes.

## Identity change (Phase 1B)

Field names did not change. `userId` in `/api/v1` responses and webhook
payloads now carries the attendee's **portal account ID**: an account that
belongs to one organization only, so an API key only ever sees its own
organization's accounts. The same email at two organizations is two unrelated
accounts with different IDs. `/api/v1/attendees` lists the portal accounts that
hold a registration in the key's organization.
