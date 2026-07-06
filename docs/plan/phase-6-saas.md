# Phase 6 — SaaS Layer (Weeks 31–34)

> **Goal**: Per-attendee billing, usage dashboard, custom domains, public API, webhooks, documentation, rate limiting.

---

##### [NEW] `apps/web/src/app/dashboard/organizations/[orgId]/billing/page.tsx`
**Usage dashboard** for convention organizers (read-only reporting, NOT invoicing):
- Per-attendee fee breakdown ($1.00 × N attendees)
- Per-booking fee breakdown ($1.00 × N hotel bookings)
- Transaction fee breakdown (1% × store/vendor revenue)
- Fee collection history (sourced from Stripe Connect `application_fee` objects via `reconcile-fees.ts` reports)
- Total fees collected to date

> [!NOTE]
> This page displays **fees already collected** at checkout via `application_fee_amount`. There are no invoices, no payment methods, no billing cycles. Conventions are never billed separately — the dashboard is purely informational.

##### [NEW] `apps/worker/src/jobs/reconcile-fees.ts`
**Fee reconciliation** (read-only audit job, NOT a billing job):
- Nightly job: aggregate all `application_fee_amount` values collected via Stripe Connect for each org
- Compare against expected fees (count of registrations × $1.00, hotel bookings × $1.00, store revenue × 1%)
- Generate usage reports for the billing dashboard (breakdown by fee type)
- **Flag discrepancies** (e.g., comped registrations that bypassed Stripe, failed webhooks)
- Does NOT create charges or invoices — all fees are already collected at checkout via `application_fee_amount`

> [!IMPORTANT]
> **No double billing**: Platform fees are collected once, at checkout time, via Stripe Connect's `application_fee_amount`. This job only audits and reports — it never charges conventions. The billing dashboard in `[orgId]/billing/page.tsx` reads from this job's reports.

##### [NEW] `apps/web/middleware.ts` (MODIFY)
**Custom domain (CNAME) support**:
- Database lookup for custom domains
- Verify domain ownership via DNS TXT record
- SSL handled by Vercel/Cloudflare

##### [NEW] `apps/web/src/app/dashboard/organizations/[orgId]/settings/page.tsx` (MODIFY)
Add custom domain configuration:
- Enter custom domain
- Show DNS records to configure (CNAME + TXT verification)
- Verify button
- Status indicator

##### [NEW] `apps/web/src/app/api/v1/`
**Public REST API**:
- API key authentication (Bearer token)
- Rate limiting (100 req/min default)
- Endpoints: events, registrations, attendees, vendors, store, badges
- Pagination, filtering, sorting
- OpenAPI spec auto-generation

> [!NOTE]
> `ApiKey` and `WebhookEndpoint` Prisma models already exist in the schema from Phase 0. This phase builds the **management UI and API logic** for these pre-existing models — it does not modify the schema.

##### [NEW] `apps/web/src/app/dashboard/organizations/[orgId]/api-keys/page.tsx`
API key management: create, revoke, set scopes.

##### [NEW] `apps/web/src/app/dashboard/organizations/[orgId]/webhooks/page.tsx`
**Webhook event system**:
- Configure webhook endpoints (URL + secret)
- Select events to subscribe to (`registration.created`, `registration.checked_in`, `order.paid`, etc.)
- Delivery logs with retry
- Test webhook button

##### [NEW] Documentation site
Docusaurus-based docs site (separate from main app, or embedded under `/docs`):
- Getting started guide
- API reference (auto-generated from OpenAPI)
- Webhook event catalog
- Convention onboarding checklist

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/analytics/page.tsx`
**Event analytics dashboard** using Recharts:
- Registration trend over time (area chart — daily/weekly registrations)
- Revenue breakdown by source (registrations, store, hotel, vendor fees)
- Check-in rate over time (line chart — cumulative check-ins during event)
- Capacity utilization by tier (bar chart)
- Fee collection summary (sourced from `reconcile-fees.ts` reports)
- Export data as CSV

> [!NOTE]
> This page is listed in the event SideNav (line ~477) and depends on reconcile-fees report data from Phase 6, which is why it's placed here rather than earlier.

---
