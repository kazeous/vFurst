# Phase 1 — Core Infrastructure (Weeks 4–9)

> **Goal**: Multi-tenant architecture, auth, RBAC, convention CRUD, Stripe Connect onboarding, dashboard shell, email service, and subdomain routing.

---

#### Multi-Tenancy & Subdomain Routing

##### [NEW] `apps/web/middleware.ts`
Next.js middleware for subdomain-based routing:
- Parse `{slug}.vfurst.app` from `Host` header
- Rewrite to `/(convention)` route group with org context
- Pass-through for `app.vfurst.app` (dashboard) and `vfurst.app` (marketing)
- Handle custom domains (Phase 6) via database lookup

##### [NEW] `apps/web/src/lib/subdomain.ts`
Subdomain resolution helpers:
- `resolveOrganization(hostname)` — lookup org by subdomain or custom domain
- `getConventionUrl(org)` — generate subdomain URL for an org

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
> This file is created in Phase 1 because org logo upload (`organizations/new` and `organizations/[orgId]/settings`) is the first feature requiring S3. Subsequent phases (Phase 3: product images, Phase 4: vendor file uploads, Phase 5: badge template images) all import from this same helper.

---

#### Auth & RBAC

##### [NEW] `apps/web/src/lib/auth.ts`
NextAuth v5 configuration:
- Credentials provider (email/password with bcrypt)
- Google OAuth provider
- Prisma adapter for session persistence
- Custom session callback to include `orgMemberships` with roles
- JWT strategy for API route authentication

##### [NEW] `apps/web/src/app/(auth)/login/page.tsx`
Login page using shadcn/ui `Card`, `TextInput`, `Button`, `FormLayout`, `Divider`.

##### [NEW] `apps/web/src/app/(auth)/register/page.tsx`
Registration page with email/password + OAuth buttons.

##### [NEW] `apps/web/src/app/(auth)/layout.tsx`
Centered auth layout — no AppShell, minimal branding.

---

#### Convention CRUD

##### [NEW] `apps/web/src/app/dashboard/organizations/page.tsx`
Org list using shadcn/ui `Table`, `EmptyState`, `Button`.

##### [NEW] `apps/web/src/app/dashboard/organizations/new/page.tsx`
Create org form: name, slug (auto-generated, editable), logo upload, contact email.

##### [NEW] `apps/web/src/app/dashboard/organizations/[orgId]/page.tsx`
Org overview: member list, events list, quick stats.

##### [NEW] `apps/web/src/app/dashboard/organizations/[orgId]/settings/page.tsx`
Org settings: name, logo, subdomain slug, email provider config (SES vs SMTP).

##### [NEW] `apps/web/src/app/dashboard/organizations/[orgId]/members/page.tsx`
Member management: invite by email, assign roles (OWNER/ADMIN/MEMBER), remove.

##### [NEW] `apps/web/src/app/dashboard/organizations/[orgId]/stripe-connect/page.tsx`
Stripe Connect onboarding:
- OAuth flow to connect convention's Stripe account
- Account status dashboard
- Test mode toggle

##### [NEW] `apps/web/src/actions/event-actions.ts`
Server Actions: `createEvent`, `updateEvent`, `publishEvent`, `archiveEvent`, `deleteEvent`.

---

#### Dashboard Shell

##### [NEW] `apps/web/src/app/dashboard/layout.tsx`
Dashboard layout using a local shadcn/ui-styled shell and sidebar:
```
├── Dashboard (home)
├── Organizations
├── Events
├── Settings
└── [User Avatar] Profile / Logout
```

##### [NEW] `apps/web/src/app/dashboard/page.tsx`
Dashboard home: recent events, quick stats (total attendees, revenue), quick action buttons.

##### [NEW] `apps/web/src/components/dashboard/app-shell.tsx`
Reusable dashboard shell wrapper with navigation state management.

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
