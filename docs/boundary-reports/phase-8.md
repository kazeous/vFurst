# Phase 8 Boundary Report

## Frontend Files Changed

- `src/features/email/email-template-panel.tsx`
- `src/features/events/event-detail-client.tsx`
- `src/features/organizations/organization-detail-client.tsx`

## Backend/API Files Changed

- `src/app/api/events/[eventId]/email-templates/route.ts`
- `src/app/api/events/[eventId]/email-templates/preview/route.ts`
- `src/app/api/events/[eventId]/email-logs/route.ts`
- `src/app/api/orgs/[orgId]/email-templates/route.ts`
- `src/app/api/orgs/[orgId]/email-templates/preview/route.ts`
- `src/app/api/orgs/[orgId]/email-logs/route.ts`
- `src/app/api/events/[eventId]/invites/route.ts`
- `src/app/api/orgs/[orgId]/invites/route.ts`
- `src/server/email.ts`
- `src/server/env.ts`
- `src/server/env.schema.ts`

## Database/Schema Files Changed

- `prisma/schema.prisma`
- `prisma/migrations/20260524160000_phase_8_email_templates/migration.sql`
- `prisma/migrations/20260524161000_phase_8_email_template_unique_indexes/migration.sql`

Added `EmailTemplateScope`, `EmailTemplateKey`, `EmailLogStatus`, `EmailProvider`, `EmailTemplate`, `EmailLog`, and partial unique indexes for scoped template overrides.

## Shared Files Changed

- `src/shared/email.ts`
- `src/shared/schemas/email.ts`
- `.env.example`
- `README.md`
- `docs/architecture.md`

## Business Logic Added

- Organization-level email template overrides.
- Event-level email template overrides.
- Template resolution order: event override, organization override, system override, built-in default.
- Safe server-side `{{ path.to.value }}` placeholder rendering for previews and delivery.
- Email delivery attempt logging with `SKIPPED`, `SENT`, and `FAILED` statuses.
- Server-side Resend API handoff when `RESEND_API_KEY` and `EMAIL_FROM` are configured.
- Invite creation now attempts server-side email delivery and logs skipped delivery when email is not configured.

## Auth/Permission Enforcement

- Organization email template and log APIs require `requireOrganizationManager()`.
- Event email template and log APIs require `requireEventManager()`.
- Invite email delivery is triggered only after existing invite creation APIs pass manager authorization.
- Frontend email UI only calls protected APIs and does not render templates or send email directly.

## Temporary Mocks or TODOs

- Missing email provider configuration records skipped logs; no fake delivery is shown.
- Built-in templates are stored in server code until a platform-admin system-template UI exists.
- Mass email, scheduled email, checklist, user notes, restrictions, and ban enforcement remain deferred.
- Invite emails are attempted after invite creation; provider failure logs `FAILED` but does not roll back the invite.

## Verification

- `npm run prisma:generate` passed.
- `npx prisma validate` passed.
- `npx prisma migrate deploy` passed against local Docker Postgres.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run test` passed.
- `npm run build` passed with local Phase 8 environment variables.
- Browser verified the event dashboard renders the email template panel and the protected email template API returns successfully.
