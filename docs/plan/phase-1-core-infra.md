# Phase 1 — Core Infrastructure (Weeks 4–9)

> **Goal**: Managed multi-tenant architecture, public identity, invitation-based organization RBAC, platform-controlled tenant provisioning, Stripe Connect onboarding, separated platform/organizer shells, email service, and subdomain routing.

---

#### Multi-Tenancy & Subdomain Routing

##### [NEW] `apps/web/middleware.ts`
Next.js middleware for subdomain-based routing:
- Parse `{slug}.vfurst.reyuugames.com` from `Host` header
- Rewrite to `/(convention)` route group with org context
- Pass-through for the central app routes (`/platform`, `/dashboard`, auth/account) and the marketing root
- Handle custom domains (Phase 6) via database lookup
- Resolve public portals only for active organizations and platform-activated domains; a customer-controlled hostname never grants organizer access

##### [NEW] `apps/web/src/lib/subdomain.ts`
Subdomain resolution helpers:
- `resolveOrganization(hostname)` — lookup org by subdomain or custom domain
- `getConventionUrl(org)` — generate subdomain URL for an org
- Resolution includes tenant lifecycle/domain activation checks and never acts as an authorization substitute for dashboard routes

---

#### File Storage (S3)

##### [NEW] `apps/web/src/lib/s3.ts`
AWS S3 client and upload helpers using `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`:
- `s3Client` — singleton S3 client configured from env vars (`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`). Also reads an optional `S3_ENDPOINT` — when set (local dev, pointing at the MinIO container), the client uses it with `forcePathStyle: true`; when unset, the SDK defaults to real AWS S3. This is the **only** local-vs-cloud difference — no `if (isLocal)` branching in application code.
- `getPresignedUploadUrl(key, contentType, maxSizeBytes)` — generates a presigned PUT URL for direct client-to-S3 uploads (avoids routing large files through the Next.js server). Works identically against MinIO and real S3.
- `getPublicUrl(key)` — returns the public URL for a stored object
- `deleteObject(key)` — deletes an object from S3
- `uploadFromBuffer(key, buffer, contentType)` — server-side upload for programmatic use (e.g., generated badge PDFs)
- Key structure: `{orgId}/{context}/{filename}` (e.g., `org_123/logos/logo.png`, `org_123/products/img_456.webp`, `org_123/vendor-files/license.pdf`)

> [!NOTE]
> This file is created in Phase 1 because the platform provisioning form and organization settings are the first features requiring org logo storage. Subsequent phases (Phase 3: product images, Phase 4: vendor file uploads, Phase 5: badge template images) all import from this same helper.

---

#### Auth & RBAC

##### [NEW] `apps/web/src/lib/auth.ts`
NextAuth v5 configuration:
- Credentials provider (email/password with bcrypt)
- Google OAuth provider
- Prisma adapter for session persistence
- Custom session callback to include `orgMemberships` with roles
- `platformRole` is independent from organization membership
- JWT strategy for API route authentication

##### [NEW] `apps/web/src/app/(auth)/login/page.tsx`
Login page using shadcn/ui `Card`, `TextInput`, `Button`, `FormLayout`, `Divider`.

##### [NEW] `apps/web/src/app/(auth)/register/page.tsx`
Public-account registration with email/password + OAuth buttons. The page must not promise a workspace, create an organization, or grant dashboard access.

##### [NEW] `apps/web/src/app/(auth)/invitations/[token]/page.tsx`
Single-use invitation acceptance for an existing or newly created account. A valid, unexpired, non-revoked invitation is required before creating `OrgMember`.

##### [NEW] `apps/web/src/actions/invitation-actions.ts`
Create, resend, revoke, and accept organization invitations. Store only a token hash, normalize the invited email, enforce expiry and one-time use, and create membership transactionally on acceptance.

##### [NEW] `apps/web/src/app/(auth)/layout.tsx`
Centered auth layout — no AppShell, minimal branding.

---

#### Platform-Controlled Tenant Provisioning

##### [NEW] `apps/web/src/app/platform/layout.tsx`
Platform control-plane boundary and shell. Every route requires `PLATFORM_ADMIN`; organization membership alone never grants access.

##### [NEW] `apps/web/src/app/platform/organizations/page.tsx`
All-tenant inventory for platform administrators with lifecycle status, subdomain/domain readiness, owner/invitation state, event count, and support links.

##### [NEW] `apps/web/src/app/platform/organizations/new/page.tsx`
Provisioning form for `PLATFORM_ADMIN`: organization name, platform subdomain, contact/initial-owner email, logo, and lifecycle status. Creation sends an owner invitation; it does not make the current public user an owner.

##### [NEW] `apps/web/src/app/platform/organizations/[orgId]/page.tsx`
Platform tenant overview: lifecycle controls, owner/invitation state, domains, provider readiness, ledger/support summary, and links into tenant-scoped diagnostics.

##### [NEW] `apps/web/src/actions/platform-organization-actions.ts`
Platform-only actions for provision, activate, suspend, and retire. Every action rechecks `PLATFORM_ADMIN` server-side and records the acting administrator.

#### Organization-Scoped Management

##### [NEW] `apps/web/src/app/dashboard/organizations/[orgId]/page.tsx`
Membership-scoped organization overview: events and operational summary. The `[orgId]` parent layout performs one shared organization access check before any child page loads.

##### [NEW] `apps/web/src/app/dashboard/organizations/[orgId]/settings/page.tsx`
Organization settings allowed by role: brand/contact details, organizer payout destination, and email-provider details. Platform subdomain, lifecycle, provider enablement, and custom-domain activation remain platform-controlled.

##### [NEW] `apps/web/src/app/dashboard/organizations/[orgId]/members/page.tsx`
Member management inside the current organization: invite by email, assign permitted roles (OWNER/ADMIN/MEMBER), resend/revoke pending invitations, and remove. These actions can never create or grant access to another organization.

##### [NEW] `apps/web/src/app/dashboard/organizations/[orgId]/stripe-connect/page.tsx`
Stripe Connect onboarding:
- Stripe-hosted Account Links in test/live mode (not classic OAuth)
- Account status dashboard
- Truthful environment-derived mode indicator; no fake per-organization mode toggle
- The organizer supplies required legal/business information through Stripe-hosted onboarding; only the platform controls whether Stripe is available globally and which fee policy applies

##### [NEW] `apps/web/src/lib/dashboard-access.ts`
Central access layer for `requirePlatformAdmin`, `requireOrgAccess`, `requireEventAccess`, and resource-scoped loaders. Authorization scope is derived from stored relationships, not hidden `orgId` form fields.

##### [NEW] `apps/web/src/actions/event-actions.ts`
Server Actions: `createEvent`, `updateEvent`, `publishEvent`, `archiveEvent`, `deleteEvent`. Organization owners/admins may create events only beneath their memberships; mutations derive the organization from the stored event instead of trusting a submitted tenant ID.

---

#### Dashboard Shell

##### [NEW] `apps/web/src/app/dashboard/layout.tsx`
Dashboard layout using the responsive Operational Calm organizer shell:
```
├── Membership-scoped organization and event switchers
├── Grouped organization/event navigation
├── Breadcrumbs + active states
├── Collapsible desktop rail / accessible mobile drawer
├── Ctrl/Cmd-K command menu
└── User menu / logout
```

There is no organizer-facing “all organizations” option or “create organization” action. A public user with no organization membership is redirected to the public account area (or shown a no-organizer-access state), never an empty organizer console. A user with one membership enters that tenant directly; a user with multiple memberships may switch only among those memberships.

##### [NEW] `apps/web/src/app/dashboard/page.tsx`
Dashboard home: recent accessible events, quick stats (total attendees, revenue), and event-level quick actions. It never contains tenant provisioning actions.

##### [NEW] `apps/web/src/components/dashboard/app-shell.tsx`
Reusable organizer shell with membership-scoped navigation data, route-context parsing, focus restoration, responsive drawer/rail behavior, and reserved create-route protection. Platform navigation is a separate shell and command scope.

##### [NEW] `apps/web/src/components/dashboard/stat-card.tsx`
Metric card component using shadcn/ui `Card`, `ProgressBar`, and semantic headings/text.

---

#### Email Service

##### [NEW] `packages/email/src/providers/ses.ts`
AWS SES email provider using `@aws-sdk/client-ses`.

##### [NEW] `packages/email/src/providers/smtp.ts`
Generic SMTP provider using `nodemailer` — for self-hosted/custom SMTP servers.

##### [NEW] `packages/email/src/index.ts`
Email service abstraction:
- Factory pattern: `createEmailProvider(config)` returns SES or SMTP instance
- Unified `sendEmail(to, template, data)` interface
- Per-org provider configuration stored in org settings

##### [NEW] `packages/email/src/templates/`
React Email templates: welcome, registration confirmation, password reset.

---

#### Background Worker Bootstrap

##### [NEW] `apps/worker/src/index.ts`
BullMQ worker entry point:
- Connects to Redis instance
- Registers job handlers for all queues
- Graceful shutdown on SIGTERM
- Health check endpoint

##### [NEW] `apps/worker/src/queues.ts`
Typed queue instances and shared queue configuration:
- `emailQueue` — transactional email delivery
- `badgeQueue` — batch badge generation
- `reconcileQueue` — nightly fee reconciliation
- Default job options (retry, backoff, timeout)

##### [NEW] `apps/worker/package.json`
Worker package config with `tsx` for dev mode and BullMQ + Redis dependencies.

##### [NEW] `apps/worker/src/jobs/send-email.ts`
BullMQ job processor for `emailQueue`:
- Dequeues email jobs and calls `sendEmail()` from `packages/email`
- Handles per-org provider resolution (SES vs SMTP based on org settings)
- Retry with exponential backoff on transient failures (network, rate limits)
- Dead-letter queue for permanently failed emails
- Logs delivery status for email template analytics

> [!NOTE]
> The worker is bootstrapped in Phase 1 because email delivery (the first background job) is needed immediately. Phase 5 adds `generate-badges.ts` and Phase 6 adds `reconcile-fees.ts` to the existing worker infrastructure.

---
