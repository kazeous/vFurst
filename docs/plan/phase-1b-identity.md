# Phase 1B — Identity re-platform

> **Goal:** staff sign in only through the studio authentik; attendees, volunteers, and vendors use tenant-scoped portal accounts.
>
> Design (authoritative): docs/superpowers/specs/2026-10-13-identity-replatform-design.md — read the sections the active unit names; do not re-derive decisions.
>
> Precondition: Phase 1 complete (2026-07-29).

## Decisions (recorded 2026-10-13)

- Staff and operators authenticate only through authentik over OIDC. vFurst stores no staff password.
- Attendees, volunteers, and vendors use tenant-scoped accounts, unique per `(organization, email)` and fully independent across tenants. There is no platform-level linking.
- Attendee sign-in uses email and password, and the email must be verified. Verification happens **email-first**: the mailbox is proven before any password exists.
- `PLATFORM_ADMIN` comes from membership of an authentik group and is re-synchronized at every staff sign-in.
- Signing out of vFurst also ends the authentik session (single logout).
- Two separate identity tables: `User` holds staff identity, `PortalAccount` holds attendee identity. ("Model 1" in the design discussion.)
- The split runtime (`apps/platform-manager`, `apps/tenant-web`) is removed, not just left frozen.
- Portals live at `{slug}.vfurst.reyuugames.com`, plus platform-activated custom domains. The deployed root domain becomes `vfurst.reyuugames.com`.
- The public API and webhook payloads keep the field name `userId`. Its value is now the tenant-scoped portal account ID.
- Local development and E2E use a mock OIDC server. The real authentik is exercised only by the deployed smoke test.
- The work is "Phase 1B — Identity re-platform". It lands on `feat/identity-replatform` and merges to `staging` once.

## Units

| Unit | Scope | System state afterwards | Plan |
|---|---|---|---|
| **1B.1** | Record decisions in the plan documents (§14). Remove the split runtime (§10), including the `AuthorizationCode` model (§5.4). | Behavior unchanged | [Unit 1B.1 plan](../superpowers/plans/2026-10-13-phase-1b-unit-1-decisions-and-split-removal.md) |
| **1B.2** | Portal identity foundation, additive only: the three new models, session and token libraries, portal `/login`, `/signup`, `/forgot-password`, `/set-password`, sign-out, the three email templates, rate limits, retention, and unit and E2E coverage of portal authentication. | Portal authentication works; no business flow uses it yet | written at unit start |
| **1B.3** | Attendee domain on `PortalAccount`: the §5.3 renames and composite foreign keys, `requirePortalAccount` everywhere, the portal account area, portal checkout, canonical-host redirects, transfers, walk-in, API, worker, dashboard reads, and deletion of central `/account` and `/checkout`. Attendee E2E migrates. | Attendees use the portal; staff still use the current credentials sign-in | written at unit start |
| **1B.4** | Staff SSO: the authentik provider and the mock OIDC, claim synchronization, the 12-hour sessions, back-channel logout, single logout, invitations; removal of `passwordHash`, `avatar`, the `Credentials`/`Google` providers, central `/register`, `/forgot-password`, `/reset-password`, the 1B.4 models in §5.4, and `manage-platform-admin.mjs`. Staff E2E migrates. | Each audience has exactly one identity system | written at unit start |
| **1B.5** | Closeout: full production E2E, visual and axe baselines, the k6 proof, the authentik and DNS/TLS runbooks, the OpenAPI/webhooks and `apps/docs` updates. Merge to `staging`, apply the deployed environment variables, reset the deployed database, deploy, run the smoke test, and record the evidence. | Ready for Phase 2 | written at unit start |

## Exit criteria

1. the full production E2E suite;
2. `npm run check:launch` with its known external failures only;
3. `npm audit --audit-level=moderate`;
4. the k6 proof;
5. the updated manual walkthrough (§14);
6. the deployed smoke test (§11.3).

## Branch and deployment

Work on `feat/identity-replatform`; merge once into `staging` in 1B.5. The deployed database is reset once in 1B.5; `prestart` stays non-destructive.
