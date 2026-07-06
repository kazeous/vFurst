## Verification Plan

### Automated Tests (Per Phase)

```bash
# Unit + integration tests (Vitest)
npm run test

# E2E tests (Playwright)
npm run test:e2e

# Type checking across monorepo
turbo run type-check

# Linting across monorepo
turbo run lint

# Database schema validation
cd packages/db && npx prisma validate

# Full build check
turbo run build
```

### Manual Verification Checkpoints

| Phase | Verification |
|-------|-------------|
| **0** | Monorepo builds, Prisma schema validates, CI pipeline green, dev env runs |
| **1** | Login/register works, dashboard renders, org CRUD works, Stripe Connect onboarding completes, subdomain routing resolves |
| **2** | Create event → configure tiers → publish → register as attendee → pay → see in admin → receive email; Create hotel block → book room → verify $1.00 fee collected |
| **3** | Add store products → purchase as attendee → unified cart works → voucher applies → refund processes |
| **4** | Submit volunteer application → admin reviews form responses → approve → assign shift (VolunteerApplication → StaffAssignment); Apply as vendor → approve → assign booth → booth payment |
| **5** | Design badge → print test badge → express check-in with QR → offline check-in works → raffle draw |
| **6** | API key works → API returns data → webhook fires → custom domain resolves → usage dashboard shows correct fee totals from reconcile-fees reports |
| **7** | Load test passes → security audit clean → E2E suite green → marketing site live → beta conventions onboarded |

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
