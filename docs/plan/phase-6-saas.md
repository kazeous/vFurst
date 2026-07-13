# Phase 6 — SaaS Layer (Weeks 31–34)

> **Goal**: Tenant-scoped usage reporting, platform-activated custom domains, organization API/webhooks, documentation, and production rate limiting within the managed SaaS boundary.

---

##### [NEW] `apps/web/src/app/dashboard/organizations/[orgId]/billing/page.tsx`
**Usage dashboard** for convention organizers (read-only reporting, NOT invoicing):
- Currency-separated attendee, booking, and transaction fee breakdowns
- USD fixed fees use $1.00; VND fixed fees use the immutable order fee captured from the platform configuration at checkout
- Transaction fee breakdown (1% × store/vendor revenue)
- Fee collection history sourced from paid provider-neutral orders, with Stripe/SePay attribution
- Total platform fees collected to date without mixing USD cents and VND whole-đồng values

> [!NOTE]
> This page displays **fees already captured** in paid provider-neutral orders. There are no invoices, no payment methods, and no billing cycles. Conventions are never billed separately; the dashboard is purely informational.

##### [NEW] `apps/worker/src/jobs/reconcile-fees.ts`
**Fee reconciliation** (read-only audit job, NOT a billing job):
- Nightly job: aggregate immutable `Order.platformFee` values from paid Stripe and SePay orders for each organization and currency
- Compare against expected fees without combining currencies (USD fixed fees, configured VND fixed fees, and 1% store/vendor revenue)
- Generate provider- and currency-aware usage reports for the billing dashboard
- **Flag discrepancies** (e.g., comped registrations that bypassed Stripe, failed webhooks)
- Does NOT create charges or invoices — every fee was already captured by the paid Order and its provider settlement path

> [!IMPORTANT]
> **No double billing**: Platform fees are captured once in each paid order—through Stripe's `application_fee_amount` or before SePay organizer ledger credit. This job only audits and reports; it never charges conventions. The billing dashboard in `[orgId]/billing/page.tsx` reads from provider-neutral order records.

##### [NEW] `apps/web/middleware.ts` (MODIFY)
**Custom domain (CNAME) support**:
- Database lookup for custom domains
- Verify domain ownership via DNS TXT record
- Resolve only the currently platform-activated hostname for an active organization
- Treat custom domains as public-portal aliases; organizer auth and dashboard routes stay on the central vFurst app domain
- SSL handled by the eventual production host; cloud cutover remains outside local Phase 0–7 verification

##### [NEW] `apps/web/src/app/dashboard/organizations/[orgId]/settings/page.tsx` (MODIFY)
Add organizer-facing custom domain request/status:
- Submit or update the requested custom domain
- Show DNS records to configure (CNAME + TXT verification)
- Show verification and platform-activation status
- Do not let an organization member directly activate, replace, or disable the routed production hostname

##### [NEW] `apps/web/src/app/platform/organizations/[orgId]/domains/page.tsx`
Platform-admin domain control:
- Review the requested hostname and tenant lifecycle state
- Verify DNS ownership and expected CNAME/TXT records server-side
- Activate, replace, or disable the public hostname
- Record the acting platform administrator and activation time
- Prevent one hostname from being attached to multiple organizations

##### [NEW] `apps/web/src/app/api/v1/`
**Public REST API**:
- API key authentication (Bearer token)
- Rate limiting (100 req/min default)
- Endpoints: events, registrations, attendees, vendors, store, badges
- Pagination, filtering, sorting
- OpenAPI spec auto-generation
- Resolve organization scope from the API key record; never accept a caller-selected organization as authorization scope

> [!NOTE]
> `ApiKey` and `WebhookEndpoint` Prisma models already exist in the schema from Phase 0. This phase builds the **management UI and API logic** for these pre-existing models — it does not modify the schema.

##### [NEW] `apps/web/src/app/dashboard/organizations/[orgId]/api-keys/page.tsx`
Membership-scoped API key management: create, revoke, and set scopes only inside an authorized organization. Every key is permanently tenant-bound.

##### [NEW] `apps/web/src/app/dashboard/organizations/[orgId]/webhooks/page.tsx`
**Webhook event system**:
- Configure webhook endpoints (URL + secret)
- Select events to subscribe to (`registration.created`, `registration.checked_in`, `order.paid`, etc.)
- Delivery logs with retry
- Test webhook button
- Derive tenant ownership from the endpoint record for update/delete/test operations

##### [NEW] Documentation site
Docusaurus-based docs site (separate from main app, or embedded under `/docs`):
- Getting started guide
- API reference (auto-generated from OpenAPI)
- Webhook event catalog
- Managed convention onboarding checklist: platform provisioning, owner invitation, tenant activation, subdomain/domain readiness, provider onboarding, and first event publication

##### [NEW] `apps/web/src/app/dashboard/events/[eventId]/analytics/page.tsx`
**Event analytics dashboard** using Recharts:
- Registration trend over time (area chart — daily/weekly registrations)
- Revenue breakdown by source (registrations, store, hotel, vendor fees)
- Check-in rate over time (line chart — cumulative check-ins during event)
- Capacity utilization by tier (bar chart)
- Fee collection summary (sourced from `reconcile-fees.ts` reports)
- Export data as CSV

> [!NOTE]
> This page is listed in the event sidebar (line ~477) and depends on reconcile-fees report data from Phase 6, which is why it's placed here rather than earlier.

---
