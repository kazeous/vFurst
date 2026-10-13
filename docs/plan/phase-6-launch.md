# Phase 6 — Launch

> **Goal:** deploy, prove the system with real conventions, and record the external evidence no automated test can produce. Application code changes in this phase are limited to fixes surfaced by the evidence work.
>
> **Authoritative checklist:** `docs/launch/go-live-checklist.md` (gates + required production environment). Supporting runbooks: `docs/launch/beta-program.md`, `docs/sepay-rollout.md`, `docs/launch/security-audit.md`, `docs/launch/accessibility-audit.md`, `docs/launch/performance-load-test.md`, `docs/launch/pci-saq-a.md`.

## Entry conditions

- Phases 1–5 complete (Phase 5 may run concurrently with early beta onboarding if the beta conventions don't need lottery mode — record the exception in `PROGRESS.md`).
- Full E2E green; `npm run check:launch` failing **only** on external/configuration gates.
- Phase 1B complete. The split runtime was removed in unit 1B.1, so no cutover decision remains.

## External evidence to record (each is its own unit)

| Unit | Evidence |
|---|---|
| 6.1 | Live deployment: production env per go-live checklist (build with correct `NEXT_PUBLIC_*` — runtime-only injection does nothing), schema sync + backfills, Cloudflare/Coolify notes in the checklist, `VFURST_LAUNCH_URL` serving marketing/legal. Then re-run the persona/tenant-isolation matrix against the deployed environment. |
| 6.2 | Production Sentry project + DSNs verified with a real captured event. |
| 6.3 | SePay Sandbox: QR, signed webhook, reconciliation, expiry, exception, payout, refund — the full simulation set from `docs/sepay-rollout.md`, recorded before enabling the provider. |
| 6.4 | Physical badge proof: Zebra WebUSB direct print (or explicit PDF-fallback print) with event/template/badge IDs, printer model, browser, legible output, tester + timestamp. |
| 6.5 | Physical screen-reader pass (NVDA or VoiceOver) on the key flows, with tester + flow evidence. |
| 6.6 | Two platform-provisioned beta conventions onboarded (provision → owner invitation → activation → first event), feedback collected, `Externally verified` status recorded in `docs/launch/beta-program.md`. |
| 6.7 | Load: re-run the 500/50 proof only if registration/check-in/auth/cache/pool/topology changed since the last recorded pass; otherwise carry the 2026-07-14 evidence forward explicitly. |

## Completion boundary

Phase 6 — and the project's launch — is complete only when `npm run check:launch` passes with zero exceptions and every row above has dated evidence in the corresponding launch doc. Do not mark any 6.x from a local simulation; that is what "externally verified" exists to prevent.
