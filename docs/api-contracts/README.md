# API Contracts

Phase 0 defines the public contract surface before implementation. The REST
OpenAPI document and webhook schemas are intentionally versioned here so later
phases can implement endpoints without changing their external shape casually.

- `openapi.yaml` - REST API contract for v1 organization, event, registration,
  order, and platform integration resources.
- `webhooks.yaml` - outbound webhook event envelope and Phase 0 event catalog.

These documents are contracts only; Phase 0 does not implement the API routes.
