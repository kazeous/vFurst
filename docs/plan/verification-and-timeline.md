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

### Manual Verification Checkpoints

| Phase | Verification |
|-------|-------------|
| **0** | Monorepo builds, Prisma schema validates, CI pipeline green, dev env runs |
| **1** | Login/register works, dashboard renders, org CRUD works, Stripe Connect onboarding completes, subdomain routing resolves |
| **2** | Create event → configure tiers/currency → publish → register as attendee → shared checkout → provider-neutral fulfillment → see in admin → receive email; create hotel block → book room → verify immutable platform fee |
| **3** | Add store products → purchase as attendee → unified cart works → voucher applies → Stripe refund and recorded SePay refund reverse fulfillment safely |
| **4** | Submit volunteer application → admin reviews form responses → approve → assign shift (VolunteerApplication → StaffAssignment); apply as vendor → approve → assign booth → shared provider-neutral booth payment |
| **5** | Design badge → print test badge → express check-in with QR → offline check-in works → raffle draw |
| **6** | API key works → API returns data → webhook fires → custom domain resolves → usage dashboard and reconciliation keep provider/currency totals separate |
| **7** | Operational Calm visual/accessibility gate passes → Stripe and signed SePay critical paths pass → 500/50 load proof passes → security audit clean → E2E suite green → marketing site live → production Sentry configured → real SePay Sandbox evidence recorded → physical screen-reader pass complete → two beta conventions onboarded |

---

## Timeline Summary

| Phase | Focus | Duration |
|-------|-------|----------|
| Phase 0 | Foundation & Planning | 3 weeks |
| Phase 1 | Core Infrastructure | 6 weeks |
| Phase 2 | Attendee Registration | 6 weeks |
| Phase 3 | Event Store & Add-ons | 4 weeks |
| Phase 4 | Volunteers & Vendors | 6 weeks |
| Phase 5 | Advanced Features | 5 weeks |
| Phase 6 | SaaS Layer | 4 weeks |
| Phase 7 | Launch | 3 weeks |
| **Total** | | **~37 weeks** |

> **Solo developer:** ~8–9 months.
> **Team of 3:** ~4–5 months.

---
