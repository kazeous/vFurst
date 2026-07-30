# ConCat parity matrix — 2026-07-26

> Source data: ConCat public docs (https://concat.app/docs/guides/intro and all child pages, fetched 2026-07-26) plus five production-UI screenshots of a live ConCat instance (AnthroCon 2026, `reg.anthrocon.org`, captured 2026-07-05). Compared against the implemented vFurst codebase. This file is the **backlog source** for phases 2–5: each gap has a stable ID that phase files reference. Update the Status column when a phase closes an item; do not delete rows.

Status legend: ✅ parity or better · 🟡 partial · ❌ missing · 🔷 deliberate divergence (standing decision, not a gap).

## Registration cluster

| Area | ConCat behavior | vFurst status |
|---|---|---|
| Attendance tiers | Tiers are products; public-visibility toggle; staff-only hidden tiers | ✅ core (`RegistrationType`, caps, upgrades) · 🟡 hidden/staff-only tiers → **REG-P5** |
| Upgrade paths | Attendee upgrades tier, pays only the price difference | ✅ implemented via registration policy |
| Tier add-ons | Complimentary add-ons auto-added at checkout; upsell add-ons offered after configuring | 🟡 add-ons exist per tier; complimentary auto-add + upsell presentation → **STO-P4** |
| Transfer | Attendee-initiated, password re-auth; target must hold an unpaid registration; no staff path | ✅ **exceeds** — durable request/accept/decline + organizer override |
| Badge designer | Layer designer; JSON export/import; pre-printed canvas preview; no image layers; no Zebra direct print (planned) | ✅ **exceeds** (image layers, PDF + ZPL, WebUSB direct print) · 🟡 design export/import + pre-printed canvas preview not implemented (low priority) |
| Cashier | Check-in UI with ID scan, warning engine, per-station config, undelivered products, staff/vendor badge variants, dual-printer routing | 🟡 walk-in + payment + print exist → gaps **EVD-P1…P4, P11** |
| Scanner | TEEMI 2D via Web Serial; PDF417 driver-license scan into search | ❌ no ID-document scanning → decision **EVD-P11** (VN market: CCCD QR instead of PDF417) |
| Raffle | Lottery for the right to purchase registration (waiting/winner/redeemed/rescinded/deleted, ticket points, staff bypass, test run) | ❌ different product — vFurst has prize raffle → **RAF-P1** |

## Products / store cluster

| Area | ConCat behavior | vFurst status |
|---|---|---|
| Product basics | Categories, display name, stock toggle, public-visibility default-off | 🟡 name/price/stock/category exist; products now archive/recover instead of hard-delete (hidden from catalog/API and removed from active carts); display name + visibility toggle + full inactive-order policy → **STO-P1** |
| Purchase policy | Available-from/until windows, min/max purchase age, restrict-to-roles, restrict-to-grants | ❌ none (no DOB collected anywhere) → **STO-P1** |
| Platform fee pass-through | Per-product "pass platform fee to customer" | ❌ decision → **STO-P8** |
| Archive semantics | Archive (not delete); removed from unpaid orders, paid orders untouched | 🟡 verify + align during **STO-P1** |
| Addons | Any product as addon of any product, unlimited, complimentary vs upsell | 🟡 registration-tier add-ons only → **STO-P4** |
| Claim tickets | Digital purchase → printed claim label at check-in, based on badge designs, validatable anywhere | ❌ → **STO-P5** |
| Discounts | Automatic discounted prices, role-targeted, date-windowed | ❌ vFurst has only voucher codes; `scheduledPricing` JSON exists but is not an engine → **REG-P4** |
| Product options | Reusable option library; 5 types (single/multi select, freetext, number, currency-add); required flag; orders keep values after disassociation | 🟡 per-product JSON only → **STO-P2** |
| Product images | Gallery, first = main, size/format constraints | ✅ |
| Surcharges | Shared library; fixed/percent/tax-rate types; assigned per product | 🟡 per-product JSON only → **STO-P3** |

## Dealers cluster

| Area | ConCat behavior | vFurst status |
|---|---|---|
| Application & review | Business info, product info, vendor-administrator review, decision email | ✅ |
| Amenities | Amenity products auto-added to cart on approval; pay → "Approved (Paid)" | 🟡 booth payment exists; amenity-product flow → **EVD-P9** scope |
| Dealer areas | Multiple areas, each with its own product category/table types | ❌ → **EVD-P9** |
| Assistants | Dealer adds assistants by username; assistants get Dealer badge status | ❌ → **EVD-P7** |
| Seating preferences | Vendor ID sharing to request adjacent seating | ❌ → **EVD-P8** |
| Den entry tickets | Timed-slot QR entry to the dealers' den, scanned by volunteers | ❌ → **EVD-P10** |

## Orders, email, volunteers, notes, domains

| Area | ConCat behavior | vFurst status |
|---|---|---|
| Orders | Unpaid/paid, staff add/remove products on unpaid orders, manual mark-paid, cancel | 🟡 orders/refunds/cashier payment exist; free staff editing + manual mark-paid → **STO-P7** |
| Fulfillment | Paid orders with fulfillable products show "Pending Fulfillment"; per-item fulfill | ❌ → **STO-P6** |
| Email templates | Override per template at organization **and** convention level (Convention > Org > Default), Handlebars, disable option, protected `register` template | 🟡 event-level overrides for 5 families work end-to-end with an allowlisted `{{token}}` renderer (not full Handlebars); org-level chain + disable + broader catalogue → **REG-P11** |
| Volunteers | Dept interest matrix (Interested/Experience/Avoid), dept leads review/request, `hr` role, lead mass email | 🟡 applications, departments/leads, shifts, assignments, and mail to assigned staff exist; structured interest matrix + lead-scoped review/request workflow → **EVD-P12** |
| User notes | Categories (Cashier/Ban/Restriction special), cashier notes at check-in, bans with/without account, ban-attempt review queue, shadow restrictions, permission-gated categories | 🟡 `AttendeeNote` exists → categories + ban/restriction system **EVD-P5/P6** |
| Custom domains | CNAME per convention; custom **email** domain with guided DNS records + verify | ✅ portal domains with DNS-ownership verification · ❌ email-domain DNS flow → **REG-P12** (nice-to-have) |

## SaaS inventory additions (audit 2026-07-30)

| Area | Inventory expectation | vFurst status |
|---|---|---|
| Event website | Organizer-managed public event content beyond visual branding | 🟡 branding and event settings exist; no content/page publish workflow → **REG-P13** |
| Organizer people operations | Search users and open one tenant-contained view of profile, orders, volunteer data, registrations, and notes | 🟡 API attendee search exists; no organizer directory/profile surface → **EVD-P13** |
| Cashier operations | ID parsing, station policy, warning engine, fulfillment/claim handover, badge-printer routing | 🟡 basic check-in, QR camera kiosk, walk-in cashier, and direct print exist; the operational controls remain **EVD-P1…P4, P11** |
| Notes and moderation | Categories, cashier alerts, account/name bans, restrictions, review queue | 🟡 free-text registration notes only → **EVD-P5/P6** |
| Public API compatibility | User/role/volunteer/department/current-user coverage plus documented business-error codes | 🟡 scoped read-only v1 events/attendees/registrations/vendors/store/badges exists; the remainder → **API-P1** |
| Convention checklist | Docs guide, not a feature | ✅ N/A — vFurst has go-live checklist + onboarding docs |

## Observed in production UI (screenshots), not in docs

| Behavior | vFurst status |
|---|---|
| One account registers up to 4 attendees (family/friends), each with own personal details + badge | ❌ registration is hard-bound to the session `User` → **REG-P1** |
| Emergency contacts (2, with phone country pickers) on registration | ❌ → **REG-P2** |
| Standards of Conduct + refund/deferral policy embedded in the registration wizard with required agreement checkboxes | ❌ → **REG-P3** |
| Refund deadline, sponsor-level donation table, rollover/deferral to next year | ❌ refunds exist; deferral/rollover → **REG-P8** (decision) |
| Live badge preview during registration | ❌ → **REG-P6** |
| Two-factor authentication page | ❌ → **REG-P9** (decision) |
| Language selector (i18n) | ❌ → **REG-P10** (decision; VN market wants vi + en) |
| Dark/light theme toggle | 🔷 light-only is a standing decision |
| Per-attendee QR code, hotel reservations, account-level cart | ✅ badge barcode/QR + hotel exist · 🟡 cart is store-scoped, not a unified all-product cart (acceptable divergence; revisit only if STO-P4 forces it) |

## Deliberate divergences (not gaps)

- **Managed invite-only tenancy** (ConCat onboards via its team as well; vFurst formalizes it in-product).
- **Light-only Operational Calm UI** vs ConCat theme toggle.
- **Authenticated checkout only.**
- **Payments:** Stripe Connect + SePay VietQR/VND with platform ledger — ConCat is Stripe-only and cannot collect on-site payments; vFurst cashier can.

## Where vFurst exceeds ConCat

SePay VietQR + organizer ledger + recorded payouts + reconciliation; platform control plane (lifecycle, domains, payment ops, email ops); REST API v1 + scoped API keys + signed outbound webhooks + OpenAPI; hotel blocks/bookings as a first-class feature; analytics dashboards + currency-safe CSV export; encrypted email outbox with dead-letter console and replay lineage; PWA offline check-in; recipient-owned transfer accept/decline; registration approval workflow + policy caps; badge image layers + WebUSB direct Zebra printing; proven 500/50 load evidence.

## Backlog index

| ID | Item | Phase |
|---|---|---|
| REG-P1 | Multi-attendee registration (attendee profiles under one account, cap configurable) | 2 |
| REG-P2 | Emergency contacts + configurable registration form fields | 2 |
| REG-P3 | Event policy documents + required agreement checkboxes in registration | 2 |
| REG-P4 | Automatic discount engine (scheduled windows + role-targeted prices; enforce `scheduledPricing`) | 2 |
| REG-P5 | Hidden/staff-only tiers (visibility toggle honored portal-side, selectable via cashier) | 2 |
| REG-P6 | Live badge preview in registration wizard | 2 |
| REG-P7 | Upgrade-path self-service surface in `/account` | 2 |
| REG-P8 | Deferral/rollover + sponsor-donation policy (product decision first) | 2 |
| REG-P9 | Two-factor authentication (decision: TOTP/passkeys) | 2 |
| REG-P10 | i18n vi + en (decision: scope + library) | 2 |
| REG-P11 | Org-level email override chain + disable + wider catalogue | 2 |
| REG-P12 | Custom email-domain DNS verification flow | 2 |
| REG-P13 | Tenant-contained public event-site content and publish workflow beyond branding | 2 |
| STO-P1 | Product policy fields: display name, visibility, availability windows, age limits (needs DOB decision), role/grant restrictions, archive semantics | 3 |
| STO-P2 | Reusable option library, 5 types, required flag, order-value retention | 3 |
| STO-P3 | Shared surcharge library incl. tax-rate type | 3 |
| STO-P4 | Universal addons (any product → any product; complimentary auto-add; upsell step) | 3 |
| STO-P5 | Claim tickets (badge-design labels printed at check-in, scannable validation) | 3 |
| STO-P6 | Order fulfillment tracking (pending-fulfillment state, per-item fulfill, undelivered list) | 3 |
| STO-P7 | Staff order editing + manual mark-paid/cancel on unpaid orders | 3 |
| STO-P8 | Per-product platform-fee pass-through (decision vs current absorbed-fee model) | 3 |
| EVD-P1 | Registration-station configuration (payment acceptance, require-ID, staff check-in, badge variants) | 4 |
| EVD-P2 | Cashier warning engine (unpaid balance, underage/guardian [needs DOB], notes/bans, badge banned words, info mismatch) | 4 |
| EVD-P3 | Undelivered products surfaced at check-in (depends STO-P6) | 4 |
| EVD-P4 | Staff/vendor badge variants + per-badge-type printer routing | 4 |
| EVD-P5 | Note categories + cashier notes shown at check-in | 4 |
| EVD-P6 | Ban/restriction system + ban-attempt review queue | 4 |
| EVD-P7 | Dealer assistants | 4 |
| EVD-P8 | Dealer seating preferences | 4 |
| EVD-P9 | Multiple dealer areas + amenity-product cart flow | 4 |
| EVD-P10 | Dealers' den timed-entry tickets (QR slots, volunteer scanning) | 4 |
| EVD-P11 | ID scanning at cashier (decision: VN CCCD QR vs PDF417; hardware scope) | 4 |
| EVD-P12 | Structured department-interest matrix + lead-scoped review/request + mass email | 4 |
| EVD-P13 | Organizer attendee directory and tenant-contained person profile | 4 |
| API-P1 | Expand scoped v1 API for user/role/volunteer/department/current-user operations and publish a stable business-error catalogue | 4 |
| RAF-P1 | Registration lottery (ConCat semantics) alongside prize raffle | 5 |
