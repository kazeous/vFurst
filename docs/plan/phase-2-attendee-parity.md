# Phase 2 — Attendee & registration parity

> **Goal:** the public registration and portal experience matches ConCat's real product: one account can register several attendees, events collect the information and agreements conventions actually need, pricing supports automatic early-bird/role discounts, and organizers can complete the related email/domain/content setup. Backlog IDs and the observed ConCat behavior live in `02-concat-parity.md` — read the referenced rows before building a unit.
>
> **Precondition:** Phase 1 complete. Every new form in this phase uses the structured-state/redirect-code patterns established there — no bare `throw` for expected input.

## Decisions recorded before the affected unit starts

| Decision | Recommendation | Affects |
|---|---|---|
| Attendee-profile model | **Confirmed 2026-07-30.** Add an `AttendeeProfile` (name, badge name, DOB, contact) owned by a `User`; `Registration` gains `attendeeProfileId` while keeping `userId` as the owning account. Default cap 4 per account, event-configurable (`maxRegistrationsPerUser` becomes the per-account attendee cap). | REG-P1, EVD-P2 |
| Transfer/profile behavior | **Confirmed 2026-07-30.** A profile remains owned by its account. A transfer must give the recipient an editable, recipient-owned attendee profile for that registration rather than exposing or mutating the sender's shared profile. Badges and check-in read the profile associated with the registration. | REG-P1, EVD-P2 |
| Date of birth | **Confirmed 2026-07-30.** Collect DOB on the attendee profile; require it only when the event enables age rules. This unlocks age-gated products and underage/guardian warnings. | REG-P1, STO-P1, EVD-P2 |
| Deferral/rollover | Defer (backlog) unless a beta convention needs it; refunds already exist. | REG-P8 |
| 2FA | TOTP via Auth.js; passkeys later (schema `Authenticator` already exists). Optional per user. | REG-P9 |
| i18n | **Confirmed 2026-07-30.** Use `next-intl`, with `vi` + `en` for portal, account, auth, and emails first; dashboard later. New Phase 2 UI copy belongs in message files. | REG-P10 |

## Units (one per session unless trivially small)

| Unit | Backlog | Scope |
|---|---|---|
| 2.1 | REG-P1 | Attendee profiles + multi-attendee registration flow ("Attendees 1/4" pattern): create/select profile per registration, per-account cap enforcement in `registration-policy.ts`, account + organizer views show attendee identity, badge/check-in/transfer read profile fields. Migration: backfill a profile per existing registration from its user. |
| 2.2 | REG-P2, REG-P3 | Event-configurable registration form: emergency contacts (reuse the `formSchema` field-definition shape), event policy documents (code of conduct, refund policy) stored per event with required-agreement checkboxes recorded on the registration (document version + timestamp). |
| 2.3 | REG-P4 | Discount engine: enforce `RegistrationType.scheduledPricing` windows at price-resolution time (single shared pricing boundary used by portal, cart, cashier, upgrades), add role-targeted automatic prices (approved volunteer/vendor/staff), display strike-through pricing. Vouchers remain a separate stacking rule — define and test the interaction. |
| 2.4 | REG-P5, REG-P6, REG-P7 | Tier visibility toggle (hidden tiers selectable only via cashier/organizer), live badge preview in the wizard (reuse designer render), self-service upgrade surface in `/account` honoring upgrade paths + price difference via the shared pricing boundary. |
| 2.5 | REG-P9 | 2FA per the decision above (enrollment, challenge, recovery codes, account-settings page). |
| 2.6 | REG-P10 | i18n foundation + vi translation of portal/account/auth/emails. |
| 2.7 | REG-P11 | Email-template inheritance: protected default templates, optional organization defaults, event override precedence, explicit disable policy, broader family catalogue, and an intentionally constrained renderer rather than arbitrary template code. |
| 2.8 | REG-P12 | Custom email-domain flow: guided DNS records, verification state, provider-domain configuration, sender eligibility, and clear fallback behavior without weakening the encrypted outbox. |
| 2.9 | REG-P13 | Event-portal content management beyond branding: tenant-contained page/content blocks, organizer preview and publish state, public rendering with no arbitrary server-side code/HTML execution, and portal cache invalidation. |

## Exit criteria

1. Two attendee profiles under one account complete registration + payment; each gets its own badge; the cap rejects the (cap+1)th with an inline message.
2. An event with required agreements blocks registration until checked and stores document version/timestamp; the organizer detail view shows them.
3. A scheduled price window and a role price both resolve correctly on portal, cashier, and upgrade paths; expired windows fall back; voucher stacking behaves per the recorded rule.
4. Hidden tier absent from the portal, selectable at the cashier.
5. E2E: multi-attendee, agreement gating, scheduled/role pricing, upgrade self-service, 2FA login. Full suite stays green; `02-concat-parity.md` statuses updated.
6. Template precedence/disable/fallback and custom sender-domain verification are exercised end-to-end without exposing a tenant's template or DNS state to another tenant.
7. A content change remains draft until published, renders only on its owning portal after publication, and is covered by tenant-containment tests.
