# Phase 4 — Event-day, operations & integration parity

> **Goal:** the cashier station reaches ConCat's operational depth (station policy, warning engine, delivery/claim handling, badge variants), user notes become a real operations tool (categories, bans, restrictions), dealers get assistants, seating, areas, and den entry tickets, and organizer/API operations fill the remaining SaaS inventory gaps. Backlog rows: `EVD-P1`…`EVD-P13` and `API-P1` in `02-concat-parity.md`.
>
> **Preconditions:** Phase 1 complete. EVD-P2 age warnings need Phase 2 DOB; EVD-P3 needs Phase 3 fulfillment (STO-P6); claim-label printing at check-in arrives with STO-P5.

## Decisions to record before the affected unit starts

| Decision | Recommendation | Affects |
|---|---|---|
| ID scanning | VN-first: parse the CCCD QR (camera or 2D scanner in keyboard mode) into cashier search + identity confirmation; treat US PDF417/Web Serial as out of scope until a US beta exists. | EVD-P1, EVD-P2, EVD-P11 |
| Ban matching | Ban records with or without an account; without an account match on normalized legal name. Any match on a registration/check-in attempt opens a review-queue item rather than hard-blocking (ConCat behavior). | EVD-P6 |
| Station identity | A "registration station" is a named per-event config selected on the cashier device (stored server-side, chosen per session) — not device fingerprinting. | EVD-P1 |

## Units

| Unit | Backlog | Scope |
|---|---|---|
| 4.1 | EVD-P5, EVD-P6 | Notes upgrade: org-defined categories with special Cashier/Ban/Restriction types (undeletable), permission-gated visibility; cashier notes surface automatically at check-in; ban records (account or legal-name), restriction shadow-flags on internal lists; ban-attempt review queue in the dashboard with approve/deny. |
| 4.2 | EVD-P1, EVD-P4 | Station config (accept payments, require ID confirmation, staff check-in enabled, separate vs combined STAFF/VENDOR badge variants, per-badge-type printer routing across two printers); check-in/cashier honors the active station; badge render supports the variant overlays. |
| 4.3 | EVD-P2, EVD-P3 | Cashier warning engine: unpaid balance, approval pending, underage/guardian (DOB), cashier notes, ban/restriction hits, badge-name banned words (org-configurable list), profile-mismatch prompt when ID confirmation is on; undelivered-products panel (from STO-P6) with per-item handover marking; registration update-at-desk (change tier via the shared pricing boundary). |
| 4.4 | EVD-P7, EVD-P8, EVD-P9 | Dealers: assistants (approved dealer invites by email/username → assistant flag on their registration/badge), seating preferences (share vendor ID, request adjacency, organizer sees the graph on the booth board), multiple dealer areas with per-area table-type products and amenity products auto-added to the cart on approval. |
| 4.5 | EVD-P10 | Den entry tickets: per-day timed slots with capacity, attendees claim a QR slot from the portal/account, volunteers scan from the check-in surface (valid at slot start and later, single consume), organizer slot dashboard. |
| 4.6 | EVD-P11 | CCCD QR parsing per the decision, feeding cashier search + the mismatch warning. |
| 4.7 | EVD-P12 | Volunteer workflow: structured Interested/Experience/Avoid department matrix, department-lead scoped review/request queues, and mass email authority limited to the lead's permitted people. |
| 4.8 | EVD-P13 | Organizer people directory: tenant-contained attendee search and a single profile view for registrations, orders, volunteer/vendor records, and notes; authorization stays derived from every stored record. |
| 4.9 | API-P1 | Expand the scoped v1 API with user/role/volunteer/department/current-user operations where the resource model permits it; document pagination, scopes, access/business error codes, and two-tenant regression coverage. Do not revive an unversioned legacy API. |

## Exit criteria

1. A cashier at a payment-disabled station is told to redirect an owing attendee; the same attendee pays at an enabled station; both stations' badge variants and printer routing behave per config.
2. A banned legal name without an account triggers a review-queue item on registration; approval releases it, denial blocks; a restricted user shows the shadow flag internally and sees nothing.
3. Check-in for an underage profile with cashier notes and an undelivered product shows all three warnings/panels in one view; handover marking updates fulfillment.
4. A dealer with one assistant and a seating preference prints both badges with dealer status; the organizer booth board shows the adjacency request; a second dealer area offers different table types; amenities land in the cart on approval.
5. A den ticket QR admits once at its slot, rejects double-scan and early entry.
6. A department lead can act only on its permitted department; an unrelated organizer cannot enumerate the people directory or profile records.
7. Every new v1 API operation returns documented, stable business/access errors and rejects cross-tenant reads and writes.
8. Full E2E green; parity statuses updated.
