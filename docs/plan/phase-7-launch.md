# Phase 7 — Launch (Weeks 35–37)

> **Goal**: Beta program, security audit, performance testing, legal pages, marketing site, public launch.

---

##### Beta program with 2–3 real conventions
- Recruit beta conventions, offer free/discounted usage
- Collect feedback, iterate on UX pain points
- Monitor production errors (Sentry integration)

##### Performance & load testing
- k6 load tests on registration + check-in flows
- Target: 500 concurrent registrations, 50 concurrent check-ins
- Database query optimization (indexes, connection pooling)

##### Security audit
- OWASP Top 10 review
- SQL injection prevention (Prisma handles this)
- XSS prevention (React handles this)
- CSRF protection (NextAuth handles this)
- Rate limiting on auth + payment endpoints
- Input validation (Zod on all endpoints)

##### PCI compliance
- Stripe handles all card data (SAQ A compliance)
- No card numbers stored in vFurst database
- Stripe Connect ensures convention funds are properly segregated

##### Accessibility audit
- WCAG 2.1 AA compliance
- Local shadcn/ui-style components follow accessible defaults where used
- Screen reader testing on key flows

##### [NEW] Legal pages
- `apps/web/src/app/(marketing)/privacy/page.tsx` — Privacy Policy
- `apps/web/src/app/(marketing)/terms/page.tsx` — Terms of Service
- `apps/web/src/app/(marketing)/dmca/page.tsx` — DMCA Takedown Policy

##### [NEW] Marketing site
- `apps/web/src/app/page.tsx` — Landing page: hero, features, pricing, testimonials
- `apps/web/src/app/(marketing)/pricing/page.tsx` — Pricing page with fee calculator
- `apps/web/src/app/(marketing)/features/page.tsx` — Feature deep-dives

##### [NEW] Playwright E2E test suite
```bash
# Critical path tests
npx playwright test --project=chromium
```
- Registration flow (end-to-end with Stripe test mode)
- Check-in flow
- Vendor application flow
- Admin CRUD operations

---
