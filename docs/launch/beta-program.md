# Phase 7 Beta Program

## Goal

Onboard 2-3 real conventions before public launch, offer discounted or free usage, collect workflow feedback, and verify production reliability with Sentry monitoring enabled.

## Beta slots

| Slot | Convention | Status | Required evidence |
|------|------------|--------|-------------------|
| 1 | TBD | Not externally verified | Signed beta agreement, org created, Stripe Connect test/live readiness checked, first event configured |
| 2 | TBD | Not externally verified | Signed beta agreement, org created, Stripe Connect test/live readiness checked, first event configured |
| 3 | TBD | Optional | Signed beta agreement, org created, Stripe Connect test/live readiness checked, first event configured |

Completion rule: slots 1 and 2 must name real conventions and use `Externally verified` status before Phase 7 can be marked complete.

## Onboarding checklist

- Create the organization in vFurst.
- Add at least one owner/admin user from the convention team.
- Configure event basics, registration tiers, hotel blocks, store products, vendor settings, volunteer departments, badge template, and check-in roles.
- Complete Stripe Connect onboarding in test mode first; switch to production credentials only after deployment.
- Configure SMTP or SES sender settings.
- Enable Sentry with `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN`.
- Run the Phase 7 Playwright suite against the beta event.
- Run the k6 registration and check-in load test with beta-sized seed data.
- Review feedback weekly and record UX issues in the session log or issue tracker.

## Feedback cadence

- Kickoff call: event scope, payment model, deadlines, and staff roles.
- Dry run: registration purchase, vendor application, badge generation, staff check-in, refunds, and data exports.
- Launch-week monitor: Sentry issues, webhook delivery, reconciliation totals, check-in throughput, and organizer feedback.
- Retro: top workflow pain points, missing reports, confusing copy, and post-launch fixes.

## Current state

The product now has beta-ready monitoring, legal pages, marketing pages, load-test scripts, and critical-path E2E coverage. Real beta convention recruitment and onboarding still requires external organizer participation and cannot be proven from the repository alone.
