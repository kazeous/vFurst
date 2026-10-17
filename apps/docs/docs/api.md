---
id: api
title: REST API
---

The public API is available under `/api/v1` on the web app.

## Authentication

Send an organization API key as a Bearer token:

```http
Authorization: Bearer vf_test_...
```

Keys are scoped per organization and rate limited to 100 requests per minute by default. The raw key is shown only once when it is created; copy it into a secret manager because vFurst stores only its hash.

## Resources

- `GET /api/v1/events`
- `GET /api/v1/events/{eventId}`
- `GET /api/v1/registrations`
- `GET /api/v1/registrations/{registrationId}`
- `GET /api/v1/attendees`
- `GET /api/v1/vendors`
- `GET /api/v1/store`
- `GET /api/v1/badges`
- `GET /api/v1/openapi.json`

List endpoints support `page` and `pageSize`; resource-specific filters include `eventId`, `status`, `category`, `printed`, and text query where applicable.

Since Phase 1B, every `userId` in a response is the attendee's portal account ID, scoped to the API key's organization (formerly a platform user ID).
