# Phase 1B Unit 1B.4 — Staff SSO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** staff and operators sign in to `/dashboard` and `/platform` only through the studio authentik over OIDC. vFurst stops storing staff passwords. Logout ends the identity-provider session, and back-channel logout revokes sessions.

**Architecture:**
- **Provider.** Auth.js v5 keeps its JWT strategy and the database-bound identity session (`identitySessionId` + `authVersion`). The Credentials and Google providers are replaced by the built-in `authentik` OIDC provider.
- **Claims.** A focused library (`lib/staff-identity.ts`) parses and synchronizes the claims, detects email conflicts, and wraps the Prisma adapter so no tokens are stored.
- **Logout.** `lib/staff-oidc.ts` reads the issuer's discovery document. A server action ends the local session and then the identity-provider session. A route handler validates back-channel logout tokens with `jose`.
- **Locally and in E2E**, a pinned `mock-oauth2-server` stands in for authentik. Its interactive login form takes any subject and a JSON claims object.

**Tech Stack:** Next.js 15.5, Auth.js v5 (`next-auth@5.0.0-beta.32`, `@auth/core@0.41.3`), Prisma 6, `jose` 6, Redis (replay protection), Vitest, Playwright, and Docker (`ghcr.io/navikt/mock-oauth2-server`).

**Spec:** `docs/superpowers/specs/2026-10-13-identity-replatform-design.md`.
- Read §2 (D1, D4, D5, D10), §5.1, §5.4, §5.6, §6 (all), §9 (S9, S10, S14), §11.1–§11.2, §12 (staff items), §13 (1B.4 row), and §15 (R1–R5).
- Unit 1B.3's plan (`docs/superpowers/plans/2026-10-15-phase-1b-unit-3-attendee-domain-on-portal-accounts.md`) shows this unit's conventions: stop points, scoped checks, E2E helper contracts, and visual-baseline rules.

## Global Constraints

- **Branch:** `feat/identity-replatform`, tasks strictly in order. Do not push or merge.
- **`PROGRESS.md`:** only Task 9 edits it.
- **Stop points:** wherever a step says **stop** or **ask**, stop and report; do not improvise.
- **Commit attribution:** do not add a `Co-Authored-By: Claude` trailer. Use conventional commit messages.
- **Portal identity is out of scope.** Do not change `PortalAccount`, the portal session or pages, `tests/e2e/support/portal.ts`, or the attendee specs, beyond their staff steps in Task 8.
- **Out of scope:**
  - **Deferred to 1B.5:** the k6 scripts, `scripts/seed-load-test.mjs` (it still writes `User.passwordHash`), `docs/api-contracts/*`, `apps/docs`, `docs/launch/authentik-setup.md`, and the deployed environment.
  - **Production E2E against the real authentik.** It runs only in the deployed smoke test (D10).
- **Destructive schema change.** Task 7 drops columns and models, which needs one local reset (spec §5.6).
  - The approval reviewer accepts that reset only on the **user's explicit authorization text** (1B.3 precedent). Task 7 Step 4 stops and asks for it.
  - `prestart` stays non-destructive. Never add `--accept-data-loss` or `--force-reset` to a script.
- **Staff E2E is expected to be red from Task 3** (credentials sign-in removed) **until Task 8.** Run only the focused specs each task names. Task 8 and Task 9 run the full gate.
- **Visual baselines are not regenerated.** None of the five baseline surfaces changes markup in this unit; `/login` is not one of them. A mismatch is a stop.
- **Secrets.** Identity-provider access, refresh, and ID tokens are never written to `Account`, logs, or Sentry. The ID token is stored only on the staff `Session` row as the logout hint, and is set to `null` when the session is revoked.
- **Client boundary (1B.3 F3/F6 rule):** no `"use client"` file imports `@/lib/staff-*`, `@/lib/auth`, `@/lib/identity-session`, `@/lib/portal-*` server modules, or `@/lib/return-to`.
- **Error handling (AGENTS.md rule 7):** expected conditions render inline or redirect with a code. Never a bare `throw` for a user-reachable condition.
- **Gates** run serially: `npx turbo run type-check lint test build --concurrency=1`.
- **Ports.** Pawket containers may hold 5432/6379. The mock uses **8090**; if it is taken, **stop and ask**.
- **Copy.** New UI copy is English. Use exactly the strings this plan gives.

**Fixed values:**

| Constant | Value |
|---|---|
| Mock image | `ghcr.io/navikt/mock-oauth2-server:2.1.10` |
| Mock port / issuer (local, E2E) | `8090` / `http://localhost:8090/vfurst` |
| Mock `JSON_CONFIG` | `{"interactiveLogin":true,"httpServer":"NettyWrapper"}` |
| `AUTH_AUTHENTIK_ID` / `AUTH_AUTHENTIK_SECRET` (local placeholders) | `vfurst-local` / `vfurst-local-mock-secret` |
| `VFURST_PLATFORM_ADMIN_GROUP` default | `vfurst-platform-admins` |
| `VFURST_STAFF_SESSION_MAX_AGE_SECONDS` default | `43200` |
| Provider checks / scopes | `["pkce", "state"]` / `openid email profile` |
| Conflict error code | `StudioAccountConflict` |
| Invitation error code (new) | `EMAIL_UNVERIFIED` |
| Back-channel endpoint | `POST /api/oidc/backchannel-logout`, form field `logout_token` |
| Logout-token event key | `http://schemas.openid.net/event/backchannel-logout` |
| `iat` window | at most 300 s in the past, at most 60 s in the future |
| Replay window | `jti` recorded for 600 000 ms; Redis failure fails **open** with a `degraded` log (S14) |
| OIDC discovery cache | 600 000 ms in process |
| Authentik user interface | `new URL("/if/user/", issuerOrigin)` |

## Review Focus

1. **An email that already belongs to another subject.** For example, an authentik account was deleted and recreated with the same email. Expected: denied with `StudioAccountConflict`, with no automatic linking, and the existing user keeps their sessions and memberships. Tests:
   - the `findStaffEmailConflict` unit tests (Task 2);
   - the E2E "an email owned by another subject is denied" (Task 3).
2. **Losing the admin group.** A platform administrator removed from the group signs in again. Expected: `platformRole` becomes `USER` before the new session is issued, and `/platform` is no longer reachable. Tests:
   - the `syncStaffUser` unit test (Task 2);
   - the E2E "removing the admin group demotes on the next sign-in" (Task 3).
3. **Logout when the identity provider is unreachable.** Expected: the local session is still revoked and the cookie cleared; the person lands on the central home. Test: the `staffSignOut` unit test with a failing discovery fetch (Task 4).
4. **A replayed or forged logout token.** Expected: 400 with `no-store`, and nothing revoked. When Redis is down, the endpoint still validates and processes the token. Tests: `staff-backchannel-logout.test.ts` and `route.test.ts` (Task 5).
5. **An invitee whose authentik email is unverified** (the authentik default, R5). Expected: `EMAIL_UNVERIFIED` with a clear message; no membership is created. Tests:
   - the unit test in `packages/auth` (Task 6);
   - the E2E "an unverified studio email cannot accept an invitation" (Task 6).

---

### Task 0: Preflight and baseline

**Files:** none

- [ ] **Step 1: Confirm the branch and a clean tree.**

  Run: `git branch --show-current; git status --short`
  Expected: `feat/identity-replatform`, no changes.

- [ ] **Step 2: Confirm the ports.**

  Run: `docker ps --format "{{.Names}} {{.Ports}}"`, then check that nothing listens on 8090 (`netstat -ano | grep ":8090 "` is empty).
  Expected: the vFurst containers hold 5432/6379/9000-9001/1025+8025, and 8090 is free. Otherwise **stop and ask**.

- [ ] **Step 3: Record the baseline.**

  Run: `npx turbo run type-check lint test build --concurrency=1`, then `npm run prestart --workspace @vfurst/web` and `E2E_PRODUCTION=1 npm run test:e2e -- --workers=1`
  Expected: both PASS, and the E2E reports **0 failed / 0 did not run** (1B.3 closed at 140). Record the counts. Anything red: **stop and report**.

---

### Task 1: Local mock identity provider and environment wiring

**Files:**
- Modify:
  - `docker-compose.yml`: a new `mock-oidc` service;
  - `.env.local` and `.env.example` (root), `apps/web/.env.example`;
  - `compose.prod.yaml` (web service environment);
  - `scripts/check-app-env.mjs`;
  - `scripts/run-e2e.mjs` (server environment defaults);
  - `AGENTS.md` (ports and environment table).
- Test: the existing `npm run test:compose` and `npm run compose:validate`.

**Interfaces:**
- Produces:
  - the service `mock-oidc` on port 8090, with image, port, and `JSON_CONFIG` from the Fixed values table;
  - the five environment keys `AUTH_AUTHENTIK_ISSUER`, `AUTH_AUTHENTIK_ID`, `AUTH_AUTHENTIK_SECRET`, `VFURST_PLATFORM_ADMIN_GROUP`, and `VFURST_STAFF_SESSION_MAX_AGE_SECONDS`, everywhere spec §11.1 says.
- **Rules:**
  - `compose.prod.yaml` uses `${AUTH_AUTHENTIK_ISSUER:-}`, `${AUTH_AUTHENTIK_ID:-}`, and `${AUTH_AUTHENTIK_SECRET:-}` (runtime-required; they fail at container start, per the 2026-10-14 build-time rule), plus `${VFURST_PLATFORM_ADMIN_GROUP:-vfurst-platform-admins}` and `${VFURST_STAFF_SESSION_MAX_AGE_SECONDS:-43200}`.
  - `check-app-env.mjs` adds the three `AUTH_AUTHENTIK_*` keys to the web `required` list, with the reason "Staff cannot sign in through the studio identity provider."
  - `run-e2e.mjs` injects each of the five keys into the server environment with the local value as the default (`process.env.X ?? <local value>`), as it already does for the payment secrets.
  - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` do not appear in any env file. Confirm with `git grep -n GOOGLE_CLIENT`; the only hit should be `apps/web/src/lib/auth.ts`, which Task 3 removes.

- [ ] **Step 1: Add the service and the keys; run `node scripts/sync-app-env.mjs`.**

- [ ] **Step 2: Start the mock and verify discovery.**

  Run: `docker compose up -d mock-oidc`, then `curl -s http://localhost:8090/vfurst/.well-known/openid-configuration`
  Expected: JSON with `"issuer":"http://localhost:8090/vfurst"`, plus `jwks_uri` and `end_session_endpoint`.
  - If the image tag cannot be pulled, **stop and ask** (do not choose another tag).
  - If `end_session_endpoint` is missing, **stop and report**.

- [ ] **Step 3: Verify the interactive login form the E2E helper will drive.**

  Open `http://localhost:8090/vfurst/authorize?client_id=vfurst-local&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fcallback%2Fauthentik&scope=openid&state=probe` with `curl -s` and read the HTML.
  Expected: a form with `input[name="username"]`, `textarea[name="claims"]`, and a submit control. If the names differ, **stop and report** the actual markup. Task 3's helper is pinned to these names.

- [ ] **Step 4: Run the compose checks.**

  Run: `npm run test:compose` and `npm run compose:validate`
  Expected: PASS, and the web key count increases by exactly 5. Record it.

- [ ] **Step 5: Commit.** `chore(dev): add the mock OIDC provider and staff SSO environment`

---

### Task 2: Staff identity library and identity-session changes

**Files:**
- Create:
  - `apps/web/src/lib/staff-identity.ts`
  - `apps/web/src/lib/staff-identity.test.ts`
- Modify:
  - `apps/web/src/lib/identity-session.ts` and `identity-session.test.ts`;
  - `packages/db/prisma/schema.prisma`: `Session` gains `oidcSid String?` with `@@index([oidcSid])`, and `idToken String? @db.Text`. These are additive, so no reset is needed.

**Interfaces (`lib/staff-identity.ts`):**
- `type StaffClaims = { sub: string; email: string; emailVerified: boolean; name: string | null; image: string | null; groups: string[]; sid: string | null }`
- `parseStaffClaims(profile: unknown): StaffClaims | null`
  - Returns null when `sub` or a syntactically valid `email` is missing.
  - `email` is normalized with `normalizeIdentityEmail`.
  - `emailVerified` is `profile.email_verified === true`.
  - `name` falls back to `preferred_username`, and `image` comes from `picture`.
  - `groups` keeps string entries only.
  - `sid` is a non-empty string or null.
- `staffPlatformRole(groups: readonly string[], adminGroup?: string): PlatformRole`
  - `adminGroup` defaults to `process.env.VFURST_PLATFORM_ADMIN_GROUP` or `"vfurst-platform-admins"`.
- `findStaffEmailConflict(claims: Pick<StaffClaims, "sub" | "email">): Promise<{ existingUserId: string; linkedUserId: string | null } | null>`
  - `existing` is the `User` holding `claims.email`.
  - `linked` is `Account(provider "authentik", providerAccountId sub).userId`.
  - There is a conflict when `existing` exists and its `id !== linked`. This covers both a new subject meeting an existing email and a linked subject whose new email belongs to someone else.
- `syncStaffUser(userId: string, claims: StaffClaims, now?: Date): Promise<void>`
  - One `user.update` sets `email`, `name`, `image`, and `platformRole` (`staffPlatformRole(claims.groups)`).
  - `emailVerified`: when the claim is true, keep the existing timestamp, or set `now` if it is null; when false, set null.
- `createStaffAdapter(client: PrismaClient): Adapter`
  - `PrismaAdapter(client)`, with `linkAccount` overridden to persist only `{ type, provider, providerAccountId, userId }`.
- `STAFF_SESSION_MAX_AGE_SECONDS: number`: a positive integer from `VFURST_STAFF_SESSION_MAX_AGE_SECONDS`, default `43200`.

**Interfaces (`lib/identity-session.ts`):**
- `IDENTITY_SESSION_MAX_AGE_SECONDS` becomes `STAFF_SESSION_MAX_AGE_SECONDS`.
- `issueIdentitySession(input)` gains optional `oidcSid?: string | null` and `idToken?: string | null`, both stored on the row.
- `bindIdentitySessionToJwt(token, signedInUserId?, now?, oidc?: { sid: string | null; idToken: string | null })` passes `oidc` into `issueIdentitySession` on sign-in.
- `revokeIdentitySession` sets `revokedAt` **and** `idToken: null`.
- The `authVersion`-mismatch revocation in `validateIdentitySession` also clears `idToken`.

- [ ] **Step 1: Write the failing tests.**
  - `staff-identity.test.ts` mocks `@vfurst/db` and `@auth/prisma-adapter`:
    - `"parses authentik claims and normalizes the email"`: `" Staff@Example.COM "` → `staff@example.com`, and the `groups` filter drops non-strings;
    - `"rejects claims without a subject or a valid email"`;
    - `"maps the configured admin group to PLATFORM_ADMIN and everything else to USER"`;
    - `"syncs profile, role, and verified state, keeping an existing verification timestamp"`;
    - `"clears emailVerified when the claim is false"`;
    - `"reports a conflict when a new subject meets an existing email"`;
    - `"reports a conflict when a linked subject's new email belongs to another user"`;
    - `"reports no conflict for the linked owner of the email"`;
    - `"the adapter persists no access, refresh, or ID token"`: call `linkAccount` with all token fields, and assert the base adapter received exactly `{ type, provider, providerAccountId, userId }`.
    - `"session lifetime defaults to 12 hours and honours a positive override"`
  - `identity-session.test.ts` adds:
    - `"stores the OIDC sid and ID token on a new identity session"`;
    - `"revoking a session clears its ID token"`.

- [ ] **Step 2: Run them to verify they fail.**

  Run (in `apps/web`): `npx vitest run src/lib/staff-identity.test.ts src/lib/identity-session.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Edit the schema, then `npm run db:validate` and `npm run prestart --workspace @vfurst/web`.**
  Expected: the schema is valid, and the additive push succeeds without a data-loss prompt. **If Prisma asks for data loss, stop.**

- [ ] **Step 4: Implement the interfaces.**

- [ ] **Step 5: Verify.**

  Run: the Step 2 command, `npm run type-check --workspace @vfurst/web`, and `npm run lint --workspace @vfurst/web`
  Expected: PASS.

- [ ] **Step 6: Commit.** `feat(web): add staff identity claims, sync, and token-free adapter`

---

### Task 3: Sign in through authentik

**Files:**
- Modify:
  - `apps/web/src/lib/auth.ts`
  - `apps/web/src/app/(auth)/login/page.tsx`
- Delete: `apps/web/src/app/(auth)/login/login-form.tsx`
- Create:
  - `tests/e2e/support/staff.ts`
  - `tests/e2e/staff-sso.spec.ts`

**Interfaces:**
- Consumes: Task 2.
- **`lib/auth.ts`:**
  - `providers: [Authentik({ issuer: process.env.AUTH_AUTHENTIK_ISSUER, clientId: process.env.AUTH_AUTHENTIK_ID, clientSecret: process.env.AUTH_AUTHENTIK_SECRET, checks: ["pkce", "state"], authorization: { params: { scope: "openid email profile" } } })]`
  - `adapter: createStaffAdapter(prisma)` and `session.maxAge: STAFF_SESSION_MAX_AGE_SECONDS`.
  - **`callbacks.signIn({ account, profile })`:**
    - return `false` unless `account?.provider === "authentik"` and `parseStaffClaims(profile)` is non-null;
    - on `findStaffEmailConflict`, call `Sentry.captureMessage("Studio account email conflict", { level: "warning", extra: { existingUserId, linkedUserId } })` and return `"/login?error=StudioAccountConflict"`;
    - otherwise return `true`.
  - **`callbacks.jwt({ token, user, account, profile })`:** when `user` and `account?.provider === "authentik"`, call `syncStaffUser(user.id, claims)` first, then `bindIdentitySessionToJwt(token, user.id, undefined, { sid: claims.sid, idToken: account.id_token ?? null })`. Without `user`, behavior is unchanged.
  - The `Credentials` and `Google` imports and the `verifyPassword` import are removed. The `session` callback and `events.signOut` are unchanged.
- **`/login` page:**
  - Heading "Sign in to vFurst", text "Staff and organizers sign in with their Reyuu Games account.", and one primary button **"Sign in with your Reyuu Games account"**.
  - The button is a form posting to a server action that calls `signIn("authentik", { redirectTo: returnTo })`. `returnTo` comes from the existing `safeReturnTo`, with fallback `/dashboard`.
  - Inline `Alert` for `?error=` codes:
    - `StudioAccountConflict` → "This Reyuu Games account uses an email that already belongs to another vFurst staff account. Contact a platform administrator."
    - `AccessDenied` → "This Reyuu Games account could not be used to sign in."
    - any other code → "Sign-in did not complete. Try again."
  - No links to `/register` or `/forgot-password`.
- **`tests/e2e/support/staff.ts`:**
  - `STAFF_ADMIN_GROUP = "vfurst-platform-admins"`
  - `createStaffFixture(prisma: PrismaClient, input: { email: string; name?: string; platformRole?: "USER" | "PLATFORM_ADMIN"; emailVerified?: boolean }): Promise<{ id: string; email: string; sub: string; groups: string[]; emailVerified: boolean }>`
    - Creates the `User` (normalized email; `emailVerified` is `new Date()` unless `false`; `platformRole`) **and** its `Account { type: "oidc", provider: "authentik", providerAccountId: sub }`, with `sub = "staff-" + randomUUID()`.
    - `groups` is `[STAFF_ADMIN_GROUP]` for `PLATFORM_ADMIN`, otherwise `[]`.
    - A fixture without the `Account` row would trip the email-conflict rule on its first sign-in.
  - `loginAsStaff(page: Page, staff: { sub: string; email: string; groups?: string[]; emailVerified?: boolean; name?: string; sid?: string }, options?: { returnTo?: string; expectPath?: string }): Promise<void>`
    1. Open `/login?returnTo=…` (`returnTo` defaults to `/dashboard`) and click "Sign in with your Reyuu Games account".
    2. On `localhost:8090`, fill `input[name="username"]` with `sub` and `textarea[name="claims"]` with `JSON.stringify({ email, email_verified: emailVerified ?? true, name, groups: groups ?? [], ...(sid ? { sid } : {}) })`, then submit.
    3. Wait until the browser has **loaded** `http://localhost:3000` + `expectPath`, which defaults to `returnTo`'s pathname.
    - Callers pass `expectPath: "/platform"` for an admin without membership (the existing `/dashboard` → `/platform` routing). For a denied sign-in, they pass `expectPath: "/login"`.

**`staff-sso.spec.ts` tests in this task:**
- `"a first sign-in creates the user and links the subject without storing tokens"`
  - Uses a subject with no fixture.
  - After sign-in, the `User` row exists with the claimed email.
  - `Account` has `provider: "authentik"` and `providerAccountId === sub`, and `access_token`, `refresh_token`, and `id_token` are all null.
- `"a platform-admin group member lands on /platform"`
- `"an organization owner lands on /dashboard"`
- `"a staff account without membership sees the 403 screen"`
- `"removing the admin group demotes on the next sign-in"`: sign in with the group, sign out by clearing cookies, sign in without it, then `/platform` is 404 and the DB role is `USER`.
- `"an email owned by another subject is denied"`
  - Create a fixture, then sign in with a **different** `sub` and the fixture's email.
  - The URL is `/login?error=StudioAccountConflict`, and the conflict copy is visible.
  - The fixture user has exactly one `Account`.

- [ ] **Step 1: Write `support/staff.ts` and the six tests.**

- [ ] **Step 2: Implement `auth.ts` and `/login`; delete `login-form.tsx`.**

- [ ] **Step 3: R1 check.** Build, then run the focused spec on the production server.

  Run: `npx turbo run build --filter=@vfurst/web`, `npm run prestart --workspace @vfurst/web`, then `E2E_PRODUCTION=1 npm run test:e2e -- --workers=1 tests/e2e/staff-sso.spec.ts`
  Expected: 6/6. Auth.js 0.41.3 sets `allowInsecureRequests` for discovery, token, and userinfo, so the `http://` mock issuer should work in production mode. If the sign-in fails on an HTTPS requirement, **stop and report** the error (spec R1 fallback needs the user).

- [ ] **Step 4: Verify the web gates.**

  Run: `npm run type-check --workspace @vfurst/web`, `npm run lint --workspace @vfurst/web`, and `npm run test --workspace @vfurst/web`
  Expected: PASS. Unit tests that exercised the Credentials provider are removed in Task 7, together with what they test. If one fails here only because Credentials is gone, mark it `it.skip` with the reason "removed in Task 7" and list it in the commit body.

- [ ] **Step 5: Commit.** `feat(web): sign staff in through the studio identity provider`

---

### Task 4: Single logout and account management links

**Files:**
- Create:
  - `apps/web/src/lib/staff-oidc.ts` and `staff-oidc.test.ts`
  - `apps/web/src/actions/staff-auth-actions.ts` and `staff-auth-actions.test.ts`
- Modify:
  - `apps/web/src/app/dashboard/layout.tsx`
  - `apps/web/src/components/dashboard/app-shell.tsx`
  - `apps/web/src/components/platform/app-shell.tsx`
  - `apps/web/src/app/platform/layout.tsx` (or wherever the platform shell is rendered)
  - `tests/e2e/staff-sso.spec.ts`

**Interfaces:**
- **`lib/staff-oidc.ts`:**
  - `getStaffOidcMetadata(): Promise<{ issuer: string; jwks_uri: string; end_session_endpoint?: string }>`
    - Fetches `${issuer without trailing slash}/.well-known/openid-configuration`, cached in process for 600 000 ms.
    - Throws when `issuer` in the document differs from `AUTH_AUTHENTIK_ISSUER` (trailing slash ignored).
  - `buildStaffEndSessionUrl(endpoint: string, input: { idTokenHint: string | null; postLogoutRedirectUri: string }): string`
    - Sets `client_id` from `AUTH_AUTHENTIK_ID`, plus `post_logout_redirect_uri`.
    - Sets `id_token_hint` only when it is non-null.
  - `getStaffAccountManagementUrl(): string`, which returns `new URL("/if/user/", new URL(AUTH_AUTHENTIK_ISSUER).origin)`.
- **`actions/staff-auth-actions.ts`:** `staffSignOut(): Promise<never>`, a `"use server"` action.
  1. `const session = await auth()`.
  2. If `session?.identitySessionId`, read that `Session.idToken`, then `revokeIdentitySession(id)`.
  3. `await signOut({ redirect: false })`.
  4. Try `getStaffOidcMetadata()`. With an `end_session_endpoint`, `redirect(buildStaffEndSessionUrl(endpoint, { idTokenHint, postLogoutRedirectUri: getCentralAppUrl("/") }))`.
  5. On any discovery failure or a missing endpoint, `redirect("/")`.
  - The local revocation always happens before any identity-provider step (spec §6.5).
- **Shells:**
  - The dashboard user menu's "Log out" and the platform shell's "Log out" both become `<form action={staffSignOut}>`. The platform shell's `/api/auth/signout` link is removed.
  - Both shells add a link **"Manage your Reyuu Games account"** to `getStaffAccountManagementUrl()`. The layout passes it as a prop, so the client shell imports no server module.

- [ ] **Step 1: Write the failing tests.**
  - `staff-oidc.test.ts`:
    - `"builds the end-session URL with the hint, client, and central return"`;
    - `"omits id_token_hint when none is stored"`;
    - `"caches discovery and rejects a mismatched issuer"`;
    - `"links to the authentik user interface on the issuer origin"`.
  - `staff-auth-actions.test.ts` mocks `@/lib/auth`, `@/lib/identity-session`, `@/lib/staff-oidc`, `next/navigation`, and `@vfurst/db`:
    - `"revokes locally, clears the cookie, then redirects to end-session"`, asserting the call order;
    - `"still revokes and returns home when discovery fails"`, Review Focus 3.
  - `staff-sso.spec.ts` adds `"logging out revokes the session and returns through the identity provider"`:
    - sign in with `sid: "sid-" + run`;
    - record requests whose URL starts with `http://localhost:8090/vfurst/endsession`;
    - click "Log out";
    - expect one such request whose query has `id_token_hint`, `client_id=vfurst-local`, and `post_logout_redirect_uri=http://localhost:3000/`;
    - the final URL is `http://localhost:3000/`;
    - the staff `Session` row with that `oidcSid` has `revokedAt` set and `idToken` null;
    - `/dashboard` then lands on `/login`.

- [ ] **Step 2: Run the unit tests to verify they fail.**

  Run (in `apps/web`): `npx vitest run src/lib/staff-oidc.test.ts src/actions/staff-auth-actions.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Verify.**

  Run: the Step 2 command, the web type-check and lint, then build and `E2E_PRODUCTION=1 npm run test:e2e -- --workers=1 tests/e2e/staff-sso.spec.ts`
  Expected: PASS (7/7 E2E).

- [ ] **Step 5: Commit.** `feat(web): end the studio session on staff logout`

---

### Task 5: Back-channel logout endpoint

**Files:**
- Create:
  - `apps/web/src/lib/staff-backchannel-logout.ts` and `staff-backchannel-logout.test.ts`
  - `apps/web/src/app/api/oidc/backchannel-logout/route.ts` and `route.test.ts`
- Modify: `apps/web/package.json`
  - Add `jose` as a direct dependency at the version already in `package-lock.json` (6.x, currently hoisted from `@auth/core`).
  - Run `npm install jose@<that exact version> --workspace @vfurst/web`. The lockfile diff must contain only the new dependency edge.

**Interfaces (`lib/staff-backchannel-logout.ts`):**
- `class LogoutTokenError extends Error { code: "signature" | "issuer" | "audience" | "iat" | "events" | "subject" | "nonce" | "jti" }`
- `verifyLogoutToken(token: string, options: { issuer: string; clientId: string; jwks: JWTVerifyGetKey; now?: Date }): Promise<{ sub: string | null; sid: string | null; jti: string }>`
  - `jwtVerify` with `issuer` and `audience`; the current time comes from `options.now`.
  - Then, in order: `iat` within the window from the Fixed values table; `events` is an object containing the event key; at least one of `sub` or `sid`; no `nonce` claim; `jti` is a non-empty string.
  - Each failure throws its code.
- `applyBackchannelLogout(claims: { sub: string | null; sid: string | null }, now?: Date): Promise<{ revokedSessions: number; authVersionBumped: boolean }>`
  - **With `sid`:** `session.updateMany({ where: { oidcSid: sid, revokedAt: null, …(sub ? { user: { accounts: { some: { provider: "authentik", providerAccountId: sub } } } } : {}) }, data: { revokedAt: now, idToken: null } })`.
  - **Without `sid`:** find the user through `Account(authentik, sub)` and increment `authVersion`. An unknown `sub` is a no-op.
- **Route `POST`:**
  1. Read `logout_token` from `request.formData()`. If it is missing, return 400.
  2. Discovery comes from `getStaffOidcMetadata()`, and the JWKS from a module-level `createRemoteJWKSet(new URL(jwks_uri))`.
  3. Run `verifyLogoutToken`.
  4. Replay check: `incrementSharedFixedWindow("oidc-logout-jti:" + jti, 600_000)`.
     - A `count > 1` returns 400.
     - When the call throws, `console.warn({ event: "oidc_backchannel_replay_check_degraded" })` and continue (S14).
  5. Run `applyBackchannelLogout`.
  6. Every response, 200 or 400, has `cache-control: no-store`, and its body is `{}`. Never echo token contents.

- [ ] **Step 1: Write the failing tests.**
  - `staff-backchannel-logout.test.ts` builds tokens with a local RS256 key pair (`generateKeyPair`, `SignJWT`, `createLocalJWKSet`). There is one test per rejection code, named `"rejects a logout token with <reason>"`:
    - a different key, a wrong `iss`, a wrong `aud`;
    - `iat` 301 s old, `iat` 61 s ahead;
    - no `events`, neither `sub` nor `sid`, a `nonce`, no `jti`.

    Plus:
    - `"accepts a valid token with sid only"`;
    - `"revokes only sessions with the sid that belong to the subject"`;
    - `"bumps authVersion when the token has no sid"`;
    - `"ignores an unknown subject"`.
  - `route.test.ts`:
    - `"returns 400 with no-store for a missing or invalid token"`;
    - `"rejects a replayed jti"`;
    - `"processes the token when the replay store is unavailable and logs degraded protection"`;
    - `"returns 200 with no-store after revoking"`.

- [ ] **Step 2: Run them to verify they fail.**

  Run (in `apps/web`): `npx vitest run src/lib/staff-backchannel-logout.test.ts src/app/api/oidc/backchannel-logout/route.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Verify.**

  Run: the Step 2 command, the web type-check and lint, and `npm audit --audit-level=moderate`
  Expected: PASS, and the audit is no worse than the Task 0 result.

- [ ] **Step 5: Commit.** `feat(web): revoke staff sessions on OIDC back-channel logout`

---

### Task 6: Invitations require a verified studio email

**Files:**
- Modify:
  - `packages/auth/src/invitations.ts` and `invitations.test.ts`
  - `apps/web/src/lib/organization-invitations.ts` and its test
  - `apps/web/src/actions/invitation-actions.ts`
  - `apps/web/src/app/(auth)/invitations/[token]/page.tsx`
  - `tests/e2e/staff-sso.spec.ts`

**Interfaces:**
- `OrganizationInvitationErrorCode` gains `"EMAIL_UNVERIFIED"`.
- `assertOrganizationInvitationCanBeAccepted(invitation, user: { email: string; emailVerified: boolean }, now?)`
  - Order of checks: state (accepted, revoked, expired), then **`EMAIL_UNVERIFIED`** with the message "Verify your Reyuu Games account email before accepting this invitation.", then `EMAIL_MISMATCH`, then the organization status.
- `acceptOrganizationInvitation` in the web lib takes `userEmailVerified: boolean`. The action selects `emailVerified` and passes `emailVerified !== null`.
- **Invitation page:**
  - The `EMAIL_UNVERIFIED` message is "Your Reyuu Games account email is not verified yet. Verify it in your Reyuu Games account, then sign in again to accept this invitation.", and it includes the "Manage your Reyuu Games account" link.
  - The page's "Create account" (`/register`) button is removed. Signed-out visitors see only "Sign in with your Reyuu Games account", which links to `/login?returnTo=<invitation path>`.

- [ ] **Step 1: Write the failing tests.**
  - `invitations.test.ts`: `"rejects an unverified email with EMAIL_UNVERIFIED before the email match"`, where an unverified user with a mismatched email gets `EMAIL_UNVERIFIED`.
  - `organization-invitations.test.ts`: `"does not create a membership for an unverified invitee"`.
  - `staff-sso.spec.ts`:
    - `"a verified studio email accepts an invitation"`;
    - `"an unverified studio email cannot accept an invitation"`: sign in with `email_verified: false`; the page shows the message, and there is no `OrgMember` row.

- [ ] **Step 2: Run the unit tests to verify they fail.**

  Run: `npm run test --workspace @vfurst/auth`, then (in `apps/web`) `npx vitest run src/lib/organization-invitations.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Verify.**

  Run: the Step 2 commands, the web and auth type-checks, then build and `E2E_PRODUCTION=1 npm run test:e2e -- --workers=1 tests/e2e/staff-sso.spec.ts`
  Expected: PASS (9/9 E2E).

- [ ] **Step 5: Commit.** `feat(auth): require a verified studio email to accept invitations`

---

### Task 7: Remove the central password identity

**Files:**
- Delete:
  - `apps/web/src/app/(auth)/register/` and `forgot-password/` and `reset-password/`;
  - `apps/web/src/actions/auth-actions.ts` and `auth-actions.test.ts`;
  - `scripts/manage-platform-admin.mjs`.
- Modify:
  - `package.json`: drop the `platform-admin` script.
  - `packages/db/prisma/schema.prisma`: drop `User.passwordHash`, `User.avatar`, `User.authenticators`, model `Authenticator`, and model `VerificationToken`.
  - Any remaining reference the commands below find. Expected: `AGENTS.md` and docs for `platform-admin`, and the email templates or helpers used only by the deleted actions.

**Rules:**
- **Email templates.** A template becomes dead when `git grep` finds no sender outside `packages/email` (likely candidates: `password-reset`, `welcome`). Delete a dead template together with its registry entry, its `delivery.ts` allowlist entry, and its tests.
  - If a template still has a live sender, keep it, and list it in the commit body.
- **Unit tests skipped in Task 3** are deleted here, together with the code they tested.
- **`@vfurst/auth/core` keeps `hashPassword` and `verifyPassword`.** Portal accounts use them.

- [ ] **Step 1: Delete and edit as listed.**

- [ ] **Step 2: Confirm nothing central is left.**

  Run: `git grep -nE "passwordHash|Credentials\\(|providers/credentials|providers/google|GOOGLE_CLIENT|manage-platform-admin|platform-admin|VerificationToken|Authenticator|/forgot-password|/reset-password|registerUser|requestPasswordReset" -- apps/web/src apps/worker/src packages scripts package.json AGENTS.md`
  Expected:
  - `passwordHash` hits only `portalAccount` code and the portal tests;
  - `/forgot-password` hits only portal files under `(convention)/[orgSlug]`;
  - `seed-load-test.mjs` hits are allowed (1B.5);
  - nothing else.

  Explain each remaining hit in the commit body.

- [ ] **Step 3: Validate the schema.**

  Run: `npm run db:validate`
  Expected: valid.

- [ ] **Step 4: Stop and ask for the local reset.**

  Report the planned command and what the local `vfurst` database holds (organizations, users, and portal accounts, with counts). Then **ask the user for explicit authorization text**, for example:
  "I explicitly authorize running, exactly once, `npm run push --workspace @vfurst/db -- --force-reset` against the local vFurst database at localhost:5432/vfurst, deleting its current data."

  Do not run it before that text arrives. After authorization:
  1. Run the 1B.3 Task 4 localhost check on `packages/db/.env`.
  2. Run `npm run push --workspace @vfurst/db -- --force-reset`, then `npm run build --workspace @vfurst/db` and `npm run prestart --workspace @vfurst/web`.

  Expected: the schema is applied and the backfills complete.

- [ ] **Step 5: Run the full serial gates.**

  Run: `npx turbo run type-check lint test build --concurrency=1`
  Expected: PASS. Record the counts.

- [ ] **Step 6: Commit.** `feat: remove central staff passwords, recovery pages, and the platform-admin script`

---

### Task 8: Staff E2E migration

**Files:**
- Modify: every spec that creates staff users or signs in through `loginWithCredentials` or the central login form. At Task 0 this is 28 specs with `passwordHash` fixtures; edit only their staff parts.
- Delete:
  - `tests/e2e/support/credentials-login.ts`;
  - `tests/e2e/account-registration.spec.ts` and `tests/e2e/password-reset-delivery.spec.ts`. They test central sign-up and central password recovery, which spec §6.6 removes. The portal equivalents are covered by `portal-auth.spec.ts`.

**Migration rules:**
- **Every staff fixture is `createStaffFixture`.** Platform administrators use `platformRole: "PLATFORM_ADMIN"`. Every staff sign-in is `loginAsStaff(page, fixture, returnTo)`.
  - Staff users without membership (for example `publicEmail` in `tenant-containment`) are still staff fixtures; they see the 403 screen.
- **Teardown** deletes staff users as before. Accounts cascade from `User`.
- **`error-visibility.spec.ts`:** replace the central wrong-password test with **"an identity-provider error renders inline on /login with no 500"**.
  - Open `/login?error=OAuthCallbackError` and `/login?error=StudioAccountConflict`.
  - Each shows its exact message from Task 3 with `role="alert"`, and no response has status ≥500.
  - Any other central-credentials assertion in that file is part of the same stop rule below.
- **The approved deletions are the two specs above, and nothing else.** Every other assertion that can no longer hold, because it tested central credentials behavior, is a **stop and ask** with an exact proposal (the 1B.3 F7/F8 pattern). Do not weaken assertions.
- **Visual baselines** must match unchanged. Never run `--update-snapshots`.

- [ ] **Step 1: Migrate and delete as listed.**

- [ ] **Step 2: Confirm nothing uses the old path.**

  Run: `git grep -nE "loginWithCredentials|credentials-login|passwordHash: await bcrypt" tests/e2e`
  Expected: only portal-account fixtures that set `passwordHash` for `PortalAccount` (in `support/portal.ts` and the portal specs).

- [ ] **Step 3: Run the full production gate on a fresh build.**

  Run: `npx turbo run build --filter=@vfurst/web --force`, `npm run prestart --workspace @vfurst/web`, then `E2E_PRODUCTION=1 npm run test:e2e -- --workers=1`
  Expected: **0 failed / 0 did not run**. Record the count.

- [ ] **Step 4: Commit.** `test(e2e): sign staff in through the mock identity provider`

---

### Task 9: Closeout

**Files:**
- Modify:
  - `docs/plan/00-reference.md`, where the tech stack's Auth row and the local stack mention the mock on 8090;
  - `docs/plan/verification.md`, only if the Phase 1B walkthrough still names a removed page;
  - `PROGRESS.md`.

- [ ] **Step 1: Run the gates from a clean build.**

  Run: `npx turbo run type-check lint test build --concurrency=1`, `npm run test:boot-config`, `npm audit --audit-level=moderate`, and `E2E_PRODUCTION=1 npm run test:e2e -- --workers=1`
  Expected: all PASS, with the E2E at 0 failed / 0 did not run.

- [ ] **Step 2: Run the plain-dev walkthrough** (`npm run dev` with the mock up, no injected env).
  1. Sign in as `PLATFORM_ADMIN` (group in claims) → `/platform`.
  2. Sign in as a non-member → the 403 screen.
  3. "Manage your Reyuu Games account" points at `http://localhost:8090/if/user/`.
  4. Log out → a request to the mock's end-session endpoint, then `/`.

  Record the result in one line.

- [ ] **Step 3: Write the `PROGRESS.md` session entry.**
  - Unit 1B.4 complete, with the Task 0 and Task 9 counts.
  - The reset authorization.
  - Every stop and how it was resolved.
  - Next: unit 1B.5 (closeout and deploy), plan "written at unit start".

- [ ] **Step 4: Commit.** `docs(progress): record phase 1B unit 1B.4`
