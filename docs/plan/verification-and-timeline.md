## Verification Plan

### Automated Tests (Per Phase)

```bash
# Unit + integration tests (Vitest)
npm run test

# E2E tests (Playwright)
npm run test:e2e

# Type checking across monorepo
npm run type-check

# Linting across monorepo
npm run lint

# Database schema validation
npm run db:validate

# Full build check
npm run build

# Dependency/security gate
npm audit --audit-level=moderate
```

Phase 7 additionally runs `npm run test:load:smoke`, the documented 500-registration/50-check-in launch proof after material critical-path changes, and `npm run check:launch`.

### Managed Tenant and Authorization Gates

These gates apply to every phase that adds or changes a dashboard route, server action, API, export, upload, or worker entry point:

- Public account creation grants no organization membership, organizer dashboard access, organization creation, or event creation.
- Only `PLATFORM_ADMIN` can provision/change lifecycle for organizations, activate custom domains, or configure platform payment providers and fees.
- Organization owner/admin/member roles follow the matrix in `00-reference.md`; navigation visibility is never the only authorization control.
- Authorization scope is derived from the stored resource relationship. A client-submitted `orgId` cannot authorize a separate resource ID.
- Tests use at least two unrelated organizations and prove tenant A cannot enumerate, read, mutate, export, upload into, or trigger operations for tenant B.
- Platform provisioning → single-use owner invitation → acceptance → organization-scoped event creation works without a public workspace-signup path.
- Suspending a tenant blocks new tenant activity but does not discard or bypass signed provider callbacks, reconciliation, refunds, or settlement work for existing orders.

### Manual Verification Checkpoints

| Phase | Verification |
|-------|-------------|
| **0** | Monorepo builds, Prisma schema validates, CI pipeline green, dev env runs |
| **1** | Public login/register works without organizer access; platform admin provisions an organization and sends the initial-owner invitation; owner accepts once and enters only that tenant; owner/admin creates an event but cannot create another organization; unrelated tenant routes/actions fail; Stripe Connect onboarding completes; active subdomain routing resolves; email is persisted before queueing, delivered through the worker, transient/permanent failures produce attempt/dead-letter evidence, and only replay-safe failures can be replayed by an authorized organizer/platform operator |
| **2** | Create event → configure tiers/currency → publish → register as attendee → shared checkout → provider-neutral fulfillment → see in admin → receive email; create hotel block → book room → verify immutable platform fee |
| **3** | Add store products → purchase as attendee → unified cart works → voucher applies → Stripe refund and recorded SePay refund reverse fulfillment safely |
| **4** | Submit volunteer application → admin reviews form responses → approve → assign shift (VolunteerApplication → StaffAssignment); apply as vendor → approve → assign booth → shared provider-neutral booth payment |
| **5** | Design badge with a tenant-owned PNG/JPEG layer → verify generated PDF contains the image → direct-print the ZPL `^GFA` image on a Zebra (or explicitly confirm the PDF fallback print) before setting `printedAt` → express check-in with QR → offline check-in works → raffle draw |
| **6** | Tenant-bound API key works → API returns only its organization data → webhook fires only for its organization → organizer submits a domain request → platform admin verifies/activates it → custom public domain resolves without hosting organizer auth → usage dashboard and reconciliation keep provider/currency totals separate |
| **7** | Managed provisioning and control-plane split pass → full multi-persona cross-tenant matrix passes → `SEC-01` through `SEC-03` close with regression evidence → Operational Calm visual/accessibility gate passes → Stripe and signed SePay critical paths pass → 500/50 load proof passes → security audit clean → E2E suite green → managed-sales marketing site live → production Sentry configured → real SePay Sandbox evidence recorded → physical screen-reader pass complete → two platform-provisioned beta conventions onboarded |

---

## Timeline Summary

| Phase | Focus | Duration |
|-------|-------|----------|
| Phase 0 | Foundation & Planning | 3 weeks |
| Phase 1 | Managed Core Infrastructure | 6 weeks |
| Phase 2 | Attendee Registration | 6 weeks |
| Phase 3 | Event Store & Add-ons | 4 weeks |
| Phase 4 | Volunteers & Vendors | 6 weeks |
| Phase 5 | Advanced Features | 5 weeks |
| Phase 6 | Tenant-scoped SaaS Layer | 4 weeks |
| Phase 7 | Managed-tenant remediation & Launch | 5–7 weeks |
| **Total** | | **~39–41 weeks** |

> **Solo developer:** ~9–10 months.
> **Team of 3:** ~4–6 months.

---
