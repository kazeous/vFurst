# Phase 3 — Commerce & product parity

> **Goal:** the store's product system reaches ConCat's configurability — policy-controlled products, reusable option/surcharge libraries, universal addons, claim tickets, and order fulfillment — without weakening the payment, currency, or tenant contracts. Backlog rows: `STO-P1`…`STO-P8` in `02-concat-parity.md`.
>
> **Preconditions:** Phase 1 complete. STO-P1 age rules and EVD warning parity depend on the Phase 2 DOB decision; if Phase 2 hasn't landed DOB yet, build STO-P1 with the age fields dormant behind the event setting.

## Decisions to record before the affected unit starts

| Decision | Recommendation | Affects |
|---|---|---|
| Options/surcharges as models vs JSON | Promote to real models (`ProductOption`, `ProductSurcharge`, join tables) — reuse across products, org-scoped, referenced by orders; migrate existing per-product JSON in place. | STO-P2, STO-P3 |
| Fee pass-through | Keep the absorbed-fee default; add per-product `passPlatformFee` that adds the fee to the attendee total at checkout and keeps ledger/fee reporting single-path. | STO-P8 |
| Grants | "Restrict to grants" = purchasable only by holders of a prior paid order item for the named product(s). Derive from `OrderItem` at price-resolution; no new model. | STO-P1 |

## Units

| Unit | Backlog | Scope |
|---|---|---|
| 3.1 | STO-P1 | Product policy fields: display name, public-visibility toggle (default hidden like ConCat), available-from/until, min/max purchase age (dormant until DOB exists), restrict-to-roles, restrict-to-grants, archive-not-delete semantics (archived products drop from unpaid orders only). Enforce in one shared purchasability boundary used by portal, cart, and cashier. |
| 3.2 | STO-P2, STO-P3 | Reusable option library (single/multi select, freetext min/max, number min/max, currency-add) with required flag; shared surcharge library (fixed, percent, tax-rate) assignable per product. Order items snapshot option values and surcharge math; disassociation never mutates existing orders. Migrate current JSON. |
| 3.3 | STO-P4 | Universal addons: any product attachable to any product (and to registration tiers through the existing add-on path), complimentary auto-added at checkout, upsell step shown after add-to-cart. Dedupe with the current `AddOnDefinition` so there is one addon concept, not two. |
| 3.4 | STO-P6, STO-P7 | Order operations: fulfillment state for fulfillable items (everything outside registration/vendor categories unless claim-ticketed), per-item "mark fulfilled", organizer "pending fulfillment" queue; staff editing of unpaid orders (add/remove items, apply voucher, manual mark-paid with recorded external method, cancel) with audit fields. |
| 3.5 | STO-P5 | Claim tickets: per-product badge-design label; check-in prints claim labels after the badge; each label carries a scannable code validatable (and consumable once) from the check-in surface. Depends on 3.4's fulfillment state (a claimed label fulfills the item). |
| 3.6 | STO-P8 | Fee pass-through per the recorded decision, visible on checkout + receipts, covered by currency-bucket fee-report tests. |

## Exit criteria

1. A hidden, date-windowed, role-restricted product is invisible/unpurchasable exactly per policy on portal, cart, and cashier — one boundary, one test suite.
2. One option and one surcharge from the libraries are attached to two different products; order items snapshot values; detaching changes no existing order.
3. A complimentary addon lands in the cart automatically; an upsell addon is offered post-add; both settle and appear on receipts.
4. A paid order with a fulfillable + a claim-ticketed item: the first is fulfillable in the dashboard queue, the second prints a claim label at check-in and validates exactly once.
5. Staff can build an order for an attendee, mark it paid with an external method, and the ledger/fee reports stay currency-correct.
6. Full E2E green; parity statuses updated; no regression in the payment-attempt, refund, or VND contracts.
