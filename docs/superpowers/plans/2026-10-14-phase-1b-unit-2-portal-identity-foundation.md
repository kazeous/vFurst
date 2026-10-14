# Phase 1B Unit 1B.2 — Portal Identity Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-scoped attendee accounts (`PortalAccount`) with email-first setup, password sign-in, password reset, host-only portal sessions, three account emails, rate limits, and retention. Everything is additive: no existing business flow uses portal accounts yet.

**Architecture:**
- Three new Prisma models sit beside the existing `User`.
- Focused libraries live under `apps/web/src/lib/` (URLs, sessions, accounts/tokens, Next.js wrappers) and are called by one server-action module and four portal pages under `(convention)/[orgSlug]/`.
- The tenant is always resolved from the request host. The middleware already sets `x-vfurst-org-slug` on tenant hosts, so a portal cookie can never be issued on the central host.

**Tech Stack:** Next.js 15 App Router (Server Actions, `cookies()`, `headers()`), Prisma 6 / PostgreSQL, bcryptjs via `@vfurst/auth/core`, Redis rate limiter, the encrypted email outbox and the worker, Vitest, Playwright, Mailpit.

**Spec:** `docs/superpowers/specs/2026-10-13-identity-replatform-design.md`. Read §5.2, §5.3 (composite FK rule), §5.5, §7.1–7.7, §7.10, §7.11, §8.3, §9 (S2–S8, S11, S14) and §13 (1B.2 row).

## Global Constraints

- **Branch:** `feat/identity-replatform`, tasks strictly in order. Do not push or merge.
- **`PROGRESS.md`:** only Task 10 edits it. Within this unit, Task 10 is what satisfies AGENTS.md rule 4.
- **Stop points:** wherever a step says **stop** or **ask**, stop and report; do not improvise.
- **Commit attribution:** do not add a `Co-Authored-By: Claude` trailer. Use your own attribution convention. Conventional commit messages.
- **Additive only:**
  - do not change `Registration`, `Order`, `Cart`, or any other existing model's ownership column (that is 1B.3);
  - do not change the central `/login`, `/register`, `/account`, `/checkout` (1B.3/1B.4);
  - do not change `ConventionPortalShell` links.
- **Error handling (AGENTS.md rule 7):**
  - expected conditions return form state (`PortalAuthFormState`) or redirect, never a bare `throw`;
  - every action uses the `…Inner` + `unstable_rethrow` + `publicActionErrorMessage` wrapper, exactly like `bookRoom` in `apps/web/src/actions/hotel-actions.ts`.
- **Gates** run serially: `npx turbo run type-check lint test build --concurrency=1`.
- **`prestart`** stays non-destructive. Never add `--accept-data-loss` or `--force-reset`.
- **Ports:** pawket containers may hold 5432/6379. Ask the user before stopping them.
- **New UI copy** is English (spec §2 Phase 2 note). Use exactly the strings this plan gives.

**Fixed values from the spec:**

| Constant | Value |
|---|---|
| `PORTAL_SESSION_MAX_AGE_SECONDS` | 2592000 (30 days, absolute) |
| `PORTAL_ACCOUNT_TOKEN_TTL_MS` | 3600000 (1 hour) |
| Secure cookie name | `__Host-vfurst-portal` |
| Insecure cookie name (plain HTTP) | `vfurst-portal` |
| Cookie attributes | HttpOnly, SameSite=Lax, Path=/, no Domain; Secure only when the request protocol is https |
| Token size and storage | 256-bit (`createHashedOpaqueToken()` default 32 bytes), stored as SHA-256 hex |
| Password rules | at least 8 characters; name required (trimmed, at least 1 character) |
| Rate-limit namespaces | `portal-login`, `portal-signup`, `portal-reset` |
| Rate-limit keys | `${orgId}:${ip}` and `${orgId}:${normalizedEmail}` |
| Rate-limit failure mode | fail closed (existing auth policy) |
| Retention | portal sessions 30 days after expiry/revocation; tokens 7 days after expiry/consumption |

**Deviations from the spec, deliberate and recorded in Task 1 and Task 10:**

1. `PortalSession` and `PortalAccountToken` use composite foreign keys with **`onDelete: Cascade`**, not `NoAction`.
   - Nothing cascades into them from `Organization`, so with `NoAction`, deleting an organization would fail its end-of-statement check.
   - The `NoAction` rule in spec §5.3 stays for the business tables that 1B.3 moves.
2. **Central-path redirect for the auth pages only.** The four portal auth pages redirect central-path requests (`localhost:3000/{slug}/login`) to the canonical portal host now. The general central-path redirect is still 1B.3. This keeps the central host free of attendee cookies (spec §7.1).
3. **`portal-url.ts` lands now** (spec §8.2), because account emails need canonical links.
4. **`getConventionOrg()` returns only `ACTIVE` organizations**, so a `SUSPENDED` portal does not render at all today. Spec §7.10's sign-in-while-suspended case therefore cannot arise yet. All portal auth actions require an `ACTIVE` organization.

## Review Focus

1. **Organization deletion with portal sessions and tokens present** must succeed. Test: the E2E teardown deletes both organizations after sessions and tokens exist (Task 9).
2. **A portal auth page opened through the central path** must never set a cookie on `localhost:3000`. Test: E2E central-path redirect plus a cookie-jar assertion (Task 9).
3. **Email variants** (` User@Example.COM `) must reach the same account in sign-up, reset, and sign-in. Test: unit tests in Task 5.
4. **A token issued for organization A used on organization B's host** must be treated as invalid. Test: `findUsablePortalAccountToken` with a foreign `orgId` returns `null` (Task 5).
5. **A double-submitted or replayed set-password link** must succeed only once. Test: the guarded `updateMany` count in Task 5, and the replay in the Task 9 E2E.

---

### Task 0: Preflight

**Files:** none

- [ ] **Step 1: Confirm branch and clean tree.**

  Run: `git branch --show-current; git status --short`
  Expected: `feat/identity-replatform`, no changes.

- [ ] **Step 2: Confirm the database and Redis ports.**

  Run: `docker ps --format "{{.Names}} {{.Ports}}"`
  Expected: the vFurst compose containers (postgres, redis, minio, mailpit) hold 5432/6379/9000-9001/1025+8025. If a pawket container holds 5432 or 6379, **stop and ask**. If the stack is down, run `docker compose up -d`.

- [ ] **Step 3: Record the baseline.**

  Run: `npx turbo run type-check lint test build --concurrency=1`
  Expected: PASS. On 2026-10-13 this was 29/29 tasks (web 190, auth 43, contracts 19, DB 44, worker 41, email 18, tenant-context 50). Record the counts. If the baseline is red, **stop and report**.

---

### Task 1: Schema — `PortalAccount`, `PortalSession`, `PortalAccountToken`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `docs/superpowers/specs/2026-10-13-identity-replatform-design.md` (§5.3 note)

**Interfaces:**
- Produces:
  - Prisma models `PortalAccount` (compound uniques `orgId_email`, `orgId_id`), `PortalSession`, `PortalAccountToken`;
  - enum `PortalAccountTokenPurpose { ACCOUNT_SETUP, PASSWORD_RESET }`;
  - relation `Organization.portalAccounts`.

- [ ] **Step 1: Add the enum and the three models exactly as in spec §5.2, with these specifics.**
  - `PortalAccount.org` → `Organization` with `onDelete: Cascade`. Add `portalAccounts PortalAccount[]` to `Organization`.
  - `PortalAccount` back-relations: `sessions PortalSession[]` and `tokens PortalAccountToken[]`.
  - `PortalSession.portalAccount` and `PortalAccountToken.portalAccount`:
    `@relation(fields: [orgId, portalAccountId], references: [orgId, id], onDelete: Cascade)`
  - Indexes from spec §5.2:
    - `PortalSession`: `@@index([portalAccountId])`, `@@index([expiresAt])`;
    - `PortalAccountToken`: `@@index([portalAccountId, purpose])`, `@@index([expiresAt])`;
    - `tokenHash @unique @db.Char(64)` on both.
  - Table maps: `portal_accounts`, `portal_sessions`, `portal_account_tokens`.

- [ ] **Step 2: Validate the schema.**

  Run: `npm run db:validate`
  Expected: `The schema at prisma\schema.prisma is valid`.

- [ ] **Step 3: Sync the local schema.**

  Run: `npm run prestart --workspace @vfurst/web`
  Expected: completes without a data-loss prompt (the change is additive). If Prisma asks for data loss, **stop and report**.

- [ ] **Step 4: Record deviation 1 in the spec.** In §5.3, directly after the sentence that begins "Every relation in the table, plus `PortalSession` and `PortalAccountToken`", add:

  > **Amended 2026-10-14 (unit 1B.2):** `PortalSession` and `PortalAccountToken` keep the composite key but use `onDelete: Cascade`. Nothing cascades into them from `Organization`, so `NoAction` would fail organization deletion. `NoAction` remains the rule for the business tables listed above.

- [ ] **Step 5: Commit.**

  ```bash
  git add packages/db/prisma/schema.prisma docs/superpowers/specs/2026-10-13-identity-replatform-design.md
  git commit -m "feat(db): add portal account, session, and token models"
  ```

---

### Task 2: Account email templates

**Files:**
- Create:
  - `packages/email/src/templates/portal-account-setup.ts`
  - `packages/email/src/templates/portal-password-reset.ts`
  - `packages/email/src/templates/portal-account-exists.ts`
- Modify:
  - `packages/email/src/types.ts`: add the three names to `EmailTemplateName`
  - `packages/email/src/index.ts`: add the three cases to `renderEmailTemplate`
  - `apps/web/src/lib/email.ts`: add the three names to `nonReplayableTemplates`
- Test: `packages/email/src/portal-account.test.ts`

**Interfaces:**
- Produces these template names and data keys:

  | Template | Data keys |
  |---|---|
  | `"portal-account-setup"` | `{ organizationName: string; setupUrl: string }` |
  | `"portal-password-reset"` | `{ organizationName: string; resetUrl: string }` |
  | `"portal-account-exists"` | `{ organizationName: string; signInUrl: string; resetUrl: string }` |

  Missing strings fall back to `"the convention"` for `organizationName` and `""` for URLs, matching the existing switch style.

- [ ] **Step 1: Write the failing tests** in `portal-account.test.ts`:

  ```ts
  it("renders the setup email with an escaped link and organization name", () => {
    const r = renderEmailTemplate("portal-account-setup", { organizationName: "Fur & Fest", setupUrl: 'https://a.test/set-password?token=x&returnTo="/"' });
    expect(r.subject).toBe("Finish creating your Fur & Fest account");
    expect(r.html).toContain("Fur &amp; Fest");
    expect(r.html).toContain("token=x&amp;returnTo=&quot;/&quot;");
    expect(r.text).toContain('https://a.test/set-password?token=x&returnTo="/"');
    expect(r.text).toContain("expires in one hour");
  });
  it("renders the reset email", () => {
    const r = renderEmailTemplate("portal-password-reset", { organizationName: "Acme Con", resetUrl: "https://a.test/r" });
    expect(r.subject).toBe("Reset your Acme Con account password");
    expect(r.text).toContain("https://a.test/r");
  });
  it("renders the account-exists notice with sign-in and reset links", () => {
    const r = renderEmailTemplate("portal-account-exists", { organizationName: "Acme Con", signInUrl: "https://a.test/login", resetUrl: "https://a.test/forgot-password" });
    expect(r.subject).toBe("You already have an Acme Con account");
    expect(r.text).toContain("https://a.test/login");
    expect(r.text).toContain("https://a.test/forgot-password");
  });
  ```

  Note: "an Acme Con": the exists subject uses the article `an` before a vowel-initial name and `a` otherwise. The implementer computes it from the first letter (`/^[aeiou]/i`).

- [ ] **Step 2: Run the tests to verify they fail.**

  Run: `npx vitest run src/portal-account.test.ts` in `packages/email`
  Expected: FAIL (unknown template).

- [ ] **Step 3: Implement the three template functions** in the style of `organization-invitation.ts` (local `escapeHtml`, `{ subject, html, text }`), with this copy:
  - **Setup:** subject `Finish creating your ${organizationName} account`. Body: "Use this link to set your name and password. It expires in one hour and can be used once." Link text: "Create my account".
  - **Reset:** subject `Reset your ${organizationName} account password`. Body: "Use this link to choose a new password. It expires in one hour and can be used once. If you did not ask for this, you can ignore this email." Link text: "Choose a new password".
  - **Exists:** subject `You already have a/an ${organizationName} account`. Body: "Someone tried to create an account with this email address. If it was you, sign in or reset your password." Link texts: "Sign in", "Reset password".

  Register them in `renderEmailTemplate`, extend `EmailTemplateName`, and add all three to `nonReplayableTemplates`.

- [ ] **Step 4: Run the tests to verify they pass.**

  Run: `npx turbo run test type-check --filter=@vfurst/email --filter=@vfurst/web --concurrency=1`
  Expected: PASS.

- [ ] **Step 5: Commit.**

  ```bash
  git add packages/email apps/web/src/lib/email.ts
  git commit -m "feat(email): add portal account setup, reset, and exists templates"
  ```

---

### Task 3: Portal URLs and request helpers

**Files:**
- Create: `apps/web/src/lib/portal-url.ts`, `apps/web/src/lib/portal-request.ts`
- Modify: `apps/web/src/lib/rate-limit.ts`
- Test:
  - `apps/web/src/lib/portal-url.test.ts`
  - `apps/web/src/lib/portal-request.test.ts`
  - `apps/web/src/lib/rate-limit.test.ts` (extend)

**Interfaces:**
- Produces:
  - `type PortalUrlOrganization = Pick<Organization, "subdomain" | "customDomain" | "customDomainStatus">`
  - `getPortalOrigin(org: PortalUrlOrganization): string`. Uses `getCanonicalTenantHostname` from `@vfurst/tenant-context` with `getTenantHostPolicy()`, passing `customDomain` only when `customDomainStatus === "ACTIVE"`. Takes protocol and port from `new URL(process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000")`.
  - `getPortalUrl(org: PortalUrlOrganization, path: string): string`. Origin plus `normalizeApplicationPath(path)` from `@vfurst/tenant-context`, which throws on `//host` or a scheme.
  - `getClientIpFromHeaders(headers: Headers): string` in `rate-limit.ts`. This is the body of today's `getClientIp`; `getClientIp(request)` now delegates to it.
  - `assertAuthActionRateLimit(namespace: string, key: string, message?: string): Promise<void>`. The optional message defaults to the current text.
  - `isSecureRequest(headers: Headers): boolean`. True only when the first `x-forwarded-proto` value, trimmed and lowercased, is `https`.
  - `getRequestPortalOrg(): Promise<Organization | null>`. Reads `x-vfurst-org-slug` from `headers()` and returns `getConventionOrg(slug)`; `null` when the header is absent (central host).

- [ ] **Step 1: Write the failing tests.**

  ```ts
  // portal-url.test.ts (vi.stubEnv per case)
  it("builds a subdomain origin with the app's protocol and port", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "localhost"); vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    expect(getPortalOrigin({ subdomain: "acme", customDomain: null, customDomainStatus: null })).toBe("http://acme.localhost:3000");
  });
  it("uses https and no port for the deployed root", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "vfurst.reyuugames.com"); vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://vfurst.reyuugames.com");
    expect(getPortalOrigin({ subdomain: "acme", customDomain: null, customDomainStatus: null })).toBe("https://acme.vfurst.reyuugames.com");
  });
  it("prefers an ACTIVE custom domain and ignores a merely VERIFIED one", () => { /* ACTIVE → https://tickets.acme.test ; VERIFIED → subdomain origin */ });
  it("keeps paths on the portal host", () => {
    expect(getPortalUrl(org, "/set-password?token=a&returnTo=%2F")).toBe("http://acme.localhost:3000/set-password?token=a&returnTo=%2F");
    expect(() => getPortalUrl(org, "//evil.test/x")).toThrow();
  });
  // portal-request.test.ts
  it("treats only an https forwarded protocol as secure", () => {
    expect(isSecureRequest(new Headers({ "x-forwarded-proto": "https" }))).toBe(true);
    expect(isSecureRequest(new Headers({ "x-forwarded-proto": "https, http" }))).toBe(true);
    expect(isSecureRequest(new Headers({ "x-forwarded-proto": "http" }))).toBe(false);
    expect(isSecureRequest(new Headers())).toBe(false);
  });
  // rate-limit.test.ts
  it("derives the client IP from headers", () => {
    expect(getClientIpFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(getClientIpFromHeaders(new Headers())).toBe("local");
  });
  ```

  For the `getRequestPortalOrg` test, mock `next/headers` and `@/lib/convention`:
  - with `x-vfurst-org-slug: acme`, it calls `getConventionOrg("acme")`;
  - without the header, it returns `null` and never calls `getConventionOrg`.

- [ ] **Step 2: Run the tests to verify they fail.**

  Run: `npx vitest run src/lib/portal-url.test.ts src/lib/portal-request.test.ts src/lib/rate-limit.test.ts` in `apps/web`
  Expected: FAIL.

- [ ] **Step 3: Implement the interfaces above.**

- [ ] **Step 4: Run the tests to verify they pass.** Same command. Expected: PASS.

- [ ] **Step 5: Commit.**

  ```bash
  git add apps/web/src/lib
  git commit -m "feat(web): add portal URL and request helpers"
  ```

---

### Task 4: Portal sessions

**Files:**
- Create: `apps/web/src/lib/portal-session.ts`
- Test: `apps/web/src/lib/portal-session.test.ts` (mock `@vfurst/db` like `identity-session.test.ts`)

**Interfaces:**
- Consumes: `createHashedOpaqueToken`, `hashOpaqueToken` from `@vfurst/auth/core`.
- Produces:
  - `PORTAL_SESSION_MAX_AGE_SECONDS = 2_592_000`
  - `type PortalAccountSummary = { id: string; orgId: string; email: string; name: string | null }`
  - `portalSessionCookieName(secure: boolean): "__Host-vfurst-portal" | "vfurst-portal"`
  - `portalSessionCookieOptions(secure: boolean, expiresAt: Date): { httpOnly: true; secure: boolean; sameSite: "lax"; path: "/"; expires: Date }`. No `domain` key.
  - `createPortalSession(input: { orgId: string; portalAccountId: string; authVersion: number; now?: Date }): Promise<{ token: string; expiresAt: Date }>`. Stores only the hash; `expiresAt = now + max age`.
  - `resolvePortalSession(input: { token: string; orgId: string; now?: Date }): Promise<PortalAccountSummary | null>`
  - `revokePortalSession(token: string, now?: Date): Promise<void>`. Sets `revokedAt` where it is still null.

- [ ] **Step 1: Write the failing tests.** One `it` per rule:
  - `createPortalSession` persists `tokenHash === hashOpaqueToken(token)`, never the raw token, with `expiresAt = now + 30 days`.
  - `resolvePortalSession` returns the summary for a live session.
  - It returns `null` when:
    - the row is missing;
    - `revokedAt` is set;
    - `expiresAt <= now`;
    - `session.authVersion !== account.authVersion`;
    - **`session.orgId !== input.orgId`** (Review Focus 2/S3).
  - `portalSessionCookieName(true) === "__Host-vfurst-portal"` and `(false) === "vfurst-portal"`.
  - `portalSessionCookieOptions(...)` has no `domain` property and `path === "/"`.

- [ ] **Step 2: Run the tests to verify they fail.**

  Run: `npx vitest run src/lib/portal-session.test.ts` in `apps/web`
  Expected: FAIL.

- [ ] **Step 3: Implement.** `resolvePortalSession` looks up `portalSession.findUnique({ where: { tokenHash } })` including `portalAccount: { select: { id, orgId, email, name, authVersion } }`.

- [ ] **Step 4: Run the tests to verify they pass.** Expected: PASS.

- [ ] **Step 5: Commit.**

  ```bash
  git add apps/web/src/lib/portal-session*
  git commit -m "feat(web): add host-bound portal sessions"
  ```

---

### Task 5: Portal accounts and tokens

**Files:**
- Create: `apps/web/src/lib/portal-accounts.ts`
- Test: `apps/web/src/lib/portal-accounts.test.ts` (mock `@vfurst/db`, `@/lib/email`, `@/lib/portal-url`)

**Interfaces:**
- Consumes:
  - `getPortalUrl` (Task 3);
  - `PortalAccountSummary` (Task 4);
  - `sendOrgEmail` (`@/lib/email`);
  - `normalizeIdentityEmail`, `hashPassword`, `verifyPassword`, `createHashedOpaqueToken`, `hashOpaqueToken` (`@vfurst/auth/core`);
  - `safeReturnTo` (`@/lib/return-to`).
- Produces:
  - `PORTAL_ACCOUNT_TOKEN_TTL_MS = 3_600_000`
  - `type PortalAccountOrganization = Pick<Organization, "id" | "name" | "subdomain" | "customDomain" | "customDomainStatus" | "contactEmail" | "emailProvider" | "emailSettings">`
  - `requestPortalAccountSetup(input: { org: PortalAccountOrganization; email: string; returnTo: string; now?: Date }): Promise<void>`
  - `requestPortalPasswordReset(input: { org: PortalAccountOrganization; email: string; returnTo: string; now?: Date }): Promise<void>`
  - `findUsablePortalAccountToken(input: { token: string; orgId: string; now?: Date }): Promise<{ purpose: "ACCOUNT_SETUP" | "PASSWORD_RESET"; account: { id: string; email: string; name: string | null } } | null>`
  - `setPortalAccountPassword(input: { token: string; orgId: string; name: string; password: string; now?: Date }): Promise<(PortalAccountSummary & { authVersion: number }) | null>`. **The only writer of `passwordHash`.**
  - `authenticatePortalAccount(input: { orgId: string; email: string; password: string }): Promise<(PortalAccountSummary & { authVersion: number }) | null>`

**Behavior:**
- **Normalize every email** with `normalizeIdentityEmail`.
- **Setup branches (spec §7.2):**
  - Upsert the account by `orgId_email` (`create: { orgId, email }`, `update: {}`), which tolerates concurrent sign-ups.
  - Password `null` → issue `ACCOUNT_SETUP` and send `portal-account-setup`.
  - Password set → send `portal-account-exists` with no state change:
    - `signInUrl = getPortalUrl(org, "/login?returnTo=" + encodeURIComponent(returnTo))`;
    - `resetUrl = getPortalUrl(org, "/forgot-password")`.
- **Reset branches (spec §7.4):**
  - Unknown email → nothing.
  - Unclaimed account → `ACCOUNT_SETUP` and the setup email.
  - Claimed account → `PASSWORD_RESET` and `portal-password-reset`.
- **Token issue:** first set `consumedAt = now` on the account's unconsumed tokens of the same purpose, then create one with `expiresAt = now + 1h`.
  - Link: `getPortalUrl(org, "/set-password?token=" + raw + "&returnTo=" + encodeURIComponent(safeReturnTo(returnTo, "/")))`.
  - Wrap `sendOrgEmail` in `try/catch` and log only `{ orgId, template }`, so delivery failure keeps responses identical (S6).
- **`setPortalAccountPassword`:** hash the password **outside** the transaction. Inside one transaction:
  1. Load the token by hash. It must be unconsumed, unexpired, and have `orgId === input.orgId`; otherwise return `null`.
  2. `updateMany({ where: { id, consumedAt: null }, data: { consumedAt: now } })`. A count other than 1 returns `null` (replay guard).
  3. Update the account: `passwordHash`, `emailVerifiedAt: now`, trimmed `name`, `authVersion: { increment: 1 }`.
  4. Consume all other unconsumed tokens of that account.
  5. Revoke its live sessions (`revokedAt: now`).
- **`authenticatePortalAccount`:** when the account is missing or has no password, still run `verifyPassword(password, dummyHash)` against a module-level, lazily computed `hashPassword("vfurst-portal-timing-equalizer")`. Then return `null`.

- [ ] **Step 1: Write the failing tests.** One `it` each:
  - Sign-up for a new email upserts, creates an `ACCOUNT_SETUP` token, and sends `portal-account-setup` with a `setupUrl` from `getPortalUrl`.
  - Sign-up for an unclaimed account sends setup.
  - Sign-up for a claimed account sends `portal-account-exists` and creates no token.
  - Sign-up with `"  User@Example.COM "` upserts `email: "user@example.com"` (Review Focus 3).
  - Reset for an unknown email sends nothing and creates nothing.
  - Reset for an unclaimed account sends setup; for a claimed account it sends `portal-password-reset`.
  - Issuing a token consumes earlier unconsumed tokens of the same purpose first.
  - A `sendOrgEmail` rejection does not reject `requestPortalAccountSetup`.
  - `findUsablePortalAccountToken` returns `null` for an expired token, a consumed token, and **a token whose `orgId` differs** (Review Focus 4).
  - `setPortalAccountPassword` returns `null` when the guarded `updateMany` count is 0 (Review Focus 5). On success it writes `emailVerifiedAt`, increments `authVersion`, and revokes sessions.
  - `authenticatePortalAccount` returns `null` for a wrong password, an unknown email, and an unclaimed account, and calls `verifyPassword` exactly once in each of those cases.

- [ ] **Step 2: Run the tests to verify they fail.**

  Run: `npx vitest run src/lib/portal-accounts.test.ts` in `apps/web`
  Expected: FAIL.

- [ ] **Step 3: Implement** per the Behavior above.

- [ ] **Step 4: Run the tests to verify they pass.** Expected: PASS.

- [ ] **Step 5: Commit.**

  ```bash
  git add apps/web/src/lib/portal-accounts*
  git commit -m "feat(web): add email-first portal account flows"
  ```

---

### Task 6: Next.js session wrappers and server actions

**Files:**
- Create:
  - `apps/web/src/lib/portal-account.ts` (server-only wrappers)
  - `apps/web/src/actions/portal-auth-actions.ts`
- Test: `apps/web/src/actions/portal-auth-actions.test.ts` (mock `next/headers`, `next/navigation`, `@/lib/portal-request`, `@/lib/portal-accounts`, `@/lib/portal-account`, `@/lib/rate-limit`)

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces, in `portal-account.ts`:
  - `getPortalAccount(org: { id: string }): Promise<PortalAccountSummary | null>`. Wrapped in React `cache`; reads the cookie named by `portalSessionCookieName(isSecureRequest(await headers()))`, then calls `resolvePortalSession`.
  - `requirePortalAccount(org: { id: string }, returnTo: string): Promise<PortalAccountSummary>`. Redirects to `/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo, "/"))}`.
  - `startPortalSession(account: { id: string; orgId: string; authVersion: number }): Promise<void>`. Revokes the session in the current cookie if there is one, creates a new session, and sets the cookie with `portalSessionCookieOptions`.
  - `endPortalSession(): Promise<void>`. Revokes the session and deletes the cookie.
- Produces, in `portal-auth-actions.ts` (`"use server"`):
  - `type PortalAuthFormState = { error?: string; sent?: boolean }`
  - `portalSignIn(prev: PortalAuthFormState, formData: FormData): Promise<PortalAuthFormState>`. Fields: `email`, `password`, `returnTo`.
  - `portalSignUp(prev, formData)`. Fields: `email`, `returnTo`. Returns `{ sent: true }`.
  - `portalRequestPasswordReset(prev, formData)`. Fields: `email`. Returns `{ sent: true }`.
  - `portalSetPassword(prev, formData)`. Fields: `token`, `name`, `password`, `confirmPassword`, `returnTo`.
  - `portalSignOut(formData: FormData): Promise<void>`. A plain form action, not used with `useActionState`. It always calls `endPortalSession()`, which is idempotent and touches only this host's cookie. It then redirects to `/login` when `getRequestPortalOrg()` returns an organization, and to `/` otherwise, because `/login` on the central host is the staff page. It never returns an error object.

**Exact copy and rules:**
- **No tenant host** (`getRequestPortalOrg()` returns `null`): the four state-returning actions (`portalSignIn`, `portalSignUp`, `portalRequestPasswordReset`, `portalSetPassword`) return `{ error: "Open this page from the convention's portal address." }`. `portalSignOut` is exempt; see its interface line. *(Clarified 2026-10-14 after the first execution stopped on this.)*
- **Validation:**
  - `email`: `z.string().trim().email("A valid email is required")`;
  - `name`: `z.string().trim().min(1, "Name is required")`;
  - `password`: `z.string().min(8, "Password must be at least 8 characters")`;
  - mismatch: `"Passwords do not match."`.
- **Rate limits:** sign-in, sign-up, and reset each call `assertAuthActionRateLimit` twice, with `${org.id}:${ip}` and `${org.id}:${email}`, using `getClientIpFromHeaders(await headers())`. The message is `"Too many attempts. Please wait a minute and try again."`.
- **Sign-in:**
  - failure → `{ error: "Email or password is incorrect." }`;
  - success → `startPortalSession`, then `redirect(safeReturnTo(returnTo, "/"))`.
- **Set-password:**
  - `null` result → `{ error: "This link is invalid, expired, or has already been used." }`;
  - success → `startPortalSession`, then redirect as for sign-in.

- [ ] **Step 1: Write the failing tests.**
  - Each of the four state-returning actions returns the no-tenant error when `getRequestPortalOrg` returns `null`.
  - `portalSignOut` with a tenant organization calls `endPortalSession` and redirects to `/login`. With no tenant host, it still calls `endPortalSession` and redirects to `/`, and it does not throw.
  - Sign-in with bad credentials returns the incorrect-credentials error and does not start a session.
  - Sign-in success calls `startPortalSession` and redirects to `"/"` when `returnTo` is `//evil.test`.
  - Sign-up and reset return `{ sent: true }` for any email, with the same object whatever the account state.
  - A thrown `RateLimitExceededError` comes back as `{ error: "Too many attempts. Please wait a minute and try again." }`.
  - Set-password mismatch returns `"Passwords do not match."`; a `null` result returns the invalid-link error.

- [ ] **Step 2: Run the tests to verify they fail.**

  Run: `npx vitest run src/actions/portal-auth-actions.test.ts` in `apps/web`
  Expected: FAIL.

- [ ] **Step 3: Implement** using the `bookRoom` wrapper pattern.

- [ ] **Step 4: Run the tests to verify they pass.** Expected: PASS.

- [ ] **Step 5: Commit.**

  ```bash
  git add apps/web/src/lib/portal-account.ts apps/web/src/actions/portal-auth-actions*
  git commit -m "feat(web): add portal sign-in, sign-up, reset, and sign-out actions"
  ```

---

### Task 7: Portal auth pages

**Files:**
- Create:
  - `apps/web/src/lib/portal-auth-page.ts`
  - `apps/web/src/app/(convention)/[orgSlug]/login/page.tsx` + `login-form.tsx`
  - `apps/web/src/app/(convention)/[orgSlug]/signup/page.tsx` + `signup-form.tsx`
  - `apps/web/src/app/(convention)/[orgSlug]/forgot-password/page.tsx` + `forgot-password-form.tsx`
  - `apps/web/src/app/(convention)/[orgSlug]/set-password/page.tsx` + `set-password-form.tsx`

**Interfaces:**
- Consumes: Tasks 3–6, plus the UI components `TextInput`, `Button`, `Alert`, `FormLayout`.
- Produces: `resolvePortalAuthPage(orgSlug: string, path: string, search: Record<string, string | string[] | undefined>): Promise<Organization>`.
  - Calls `notFound()` when `getConventionOrg(orgSlug)` is `null`.
  - When `getRequestPortalOrg()` is `null` or a different organization, redirects to `getPortalUrl(org, path + "?" + query)` (deviation 2).
  - Otherwise returns the organization.

**Page rules:**
- Every page sets `export const dynamic = "force-dynamic"`.
- Forms use `useActionState`, keep entered values, disable submit while pending, and render errors in `<Alert variant="error">`.
- **`/login`:**
  - Signed in (`getPortalAccount`) → shows `Signed in as {email}` and a `portalSignOut` form with the button "Sign out".
  - Otherwise → labels "Email", "Password"; button "Sign in"; links "Create account" (`/signup?returnTo=…`) and "Forgot password?" (`/forgot-password`).
- **`/signup`:** label "Email", button "Create account". After `sent`, show `<Alert variant="success">` with "Check your email. If this address can be used here, we sent a link that expires in one hour."
- **`/forgot-password`:** label "Email", button "Send link", the same success copy.
- **`/set-password`:**
  - Reads `token` and `returnTo` from the query and calls `findUsablePortalAccountToken`.
  - Invalid → the invalid-link error plus a "Request a new link" link to `/forgot-password`.
  - Valid → heading "Create your account" (`ACCOUNT_SETUP`) or "Choose a new password" (`PASSWORD_RESET`); labels "Name" (prefilled), "New password", "Confirm password"; button "Save password".
  - Sets `export const metadata = { referrer: "no-referrer" }` (spec §7.5).

- [ ] **Step 1: Implement the helper and the four pages.**

- [ ] **Step 2: Type-check, lint, and build.**

  Run: `npx turbo run type-check lint build --filter=@vfurst/web --concurrency=1`
  Expected: PASS with no new warnings.

- [ ] **Step 3: Probe the pages under plain dev.**

  Start the app with `npm run dev`. Create an ACTIVE organization with slug `probe` through `npx tsx` or Prisma Studio, then check:
  - `http://probe.localhost:3000/login`, `/signup`, `/forgot-password`, and `/set-password?token=x` render;
  - `http://localhost:3000/probe/login` answers with a redirect to `http://probe.localhost:3000/login`.

  Delete the probe organization afterwards. If a page shows a blank "Application error", **stop and report**.

- [ ] **Step 4: Commit.**

  ```bash
  git add "apps/web/src/app/(convention)/[orgSlug]" apps/web/src/lib/portal-auth-page.ts
  git commit -m "feat(web): add portal sign-in, sign-up, reset, and set-password pages"
  ```

---

### Task 8: Retention for portal sessions and tokens

**Files:**
- Modify:
  - `packages/db/src/identity-retention.ts`
  - `apps/worker/src/jobs/cleanup-identity-protocol-records.ts`
- Test:
  - `packages/db/src/identity-retention.test.ts`
  - `apps/worker/src/jobs/cleanup-identity-protocol-records.test.ts`

**Interfaces:**
- Produces:
  - Constants: `DEFAULT_PORTAL_SESSION_RETENTION_MS = 30 days`, `DEFAULT_PORTAL_TOKEN_RETENTION_MS = 7 days`.
  - Input gains `portalSessionRetentionMs?: number` and `portalTokenRetentionMs?: number`, both validated by `assertPositiveDuration`.
  - The result gains `portalSessionsSelected`, `portalSessionsDeleted`, `portalAccountTokensSelected`, `portalAccountTokensDeleted`.
  - `hasMore` is true when any of the three selections equals `batchSize`.
  - The worker result gains `portalSessionsDeleted` and `portalAccountTokensDeleted`.

- [ ] **Step 1: Extend the tests.** The `tx` mock gains `portalSession` and `portalAccountToken`. Assert the exact `where` clauses:
  - `{ OR: [{ expiresAt: { lte: portalSessionCutoff } }, { revokedAt: { lte: portalSessionCutoff } }] }` for sessions;
  - `{ OR: [{ expiresAt: { lte: tokenCutoff } }, { consumedAt: { lte: tokenCutoff } }] }` for tokens;
  - both with `orderBy: [{ createdAt: "asc" }, { id: "asc" }]`, `take: batchSize`, and the `where` rechecked in `deleteMany`.

  Assert that `hasMore` is true when only the token selection is full. Keep the existing staff-session assertions unchanged.

- [ ] **Step 2: Run the tests to verify they fail.**

  Run: `npx turbo run test --filter=@vfurst/db --filter=@vfurst/worker --concurrency=1`
  Expected: FAIL.

- [ ] **Step 3: Implement.** Update the doc comment to "Prunes bounded, rechecked batches of staff sessions, portal sessions, and portal account tokens."

- [ ] **Step 4: Run the tests to verify they pass.** Same command. Expected: PASS.

- [ ] **Step 5: Commit.**

  ```bash
  git add packages/db/src/identity-retention* apps/worker/src/jobs/cleanup-identity-protocol-records*
  git commit -m "feat(db): prune expired portal sessions and tokens"
  ```

---

### Task 9: End-to-end portal authentication

**Files:**
- Create: `tests/e2e/portal-auth.spec.ts`

**Interfaces:**
- Consumes: the pages and copy from Tasks 6–7, the email subjects from Task 2, and Mailpit at `http://127.0.0.1:8025/api/v1/messages`, following `tests/e2e/password-reset-delivery.spec.ts`.

**Fixtures (`beforeAll`, Prisma):**
- Two ACTIVE organizations, A and B, with slugs `portal-a-${runId}` and `portal-b-${runId}`, used as both `slug` and `subdomain`, with `contactEmail` set.
- One unclaimed `PortalAccount` in A: `walkin-${runId}@example.com`, with no password.

**Teardown (`afterAll`):**
1. Delete `emailDelivery` rows for the test recipients.
2. Delete both organizations. This **must** succeed while portal sessions and tokens exist (Review Focus 1).
3. Assert that `portalAccount.count({ where: { orgId: { in: [a, b] } } })` is 0.

**Tests, in one serial `describe`:**
1. **Email-first setup.** On `http://portal-a-….localhost:3000/signup`, submit `user-${runId}@example.com`.
   - Expect the "Check your email" alert.
   - Poll Mailpit for the subject `Finish creating your … account`. The link host must be the A host.
   - Open it, fill "Name", "New password", "Confirm password", and click "Save password".
   - Expect `/login` to show `Signed in as user-…`.
   - Expect the stored `portalAccountToken.tokenHash` to equal the SHA-256 of the link token, never the raw token.
2. **Account-exists notice.** Sign up again with the same email. Expect the same alert, and Mailpit receives `You already have a … account`.
3. **Sign-in.** Sign out; a wrong password gives the inline "Email or password is incorrect."; the correct password signs in.
4. **Cookie shape.** `context.cookies("http://portal-a-….localhost:3000")` contains `vfurst-portal`, with `httpOnly: true`, `sameSite: "Lax"`, and `domain` equal to `portal-a-….localhost`, without a leading dot.
5. **Cross-tenant isolation.** Copy A's `vfurst-portal` cookie value onto the B host and open B's `/login`: it shows the sign-in form, not "Signed in as". Signing in on B with A's credentials fails.
6. **Reset and replay.** Forgot-password on A gives the subject `Reset your … account password`. Set a new password; the old password now fails. Reopening the same link shows "This link is invalid, expired, or has already been used."
7. **Walk-in claim.** Sign up on A with the walk-in email. Mailpit receives the **setup** subject, not the exists notice.
8. **Central path.** `page.goto("http://localhost:3000/portal-a-…/login")` ends on the A host, and `context.cookies("http://localhost:3000")` contains no `vfurst-portal` cookie (Review Focus 2).

- [ ] **Step 1: Write the spec.**

- [ ] **Step 2: Run it in development mode.**

  Run: `npm run test:e2e -- --grep "portal auth"` (the `describe` title must contain "portal auth").
  Expected: all pass. If Mailpit never receives mail, confirm the worker is running in the runner's output before changing code.

- [ ] **Step 3: Run it in production mode.**

  Run: `E2E_PRODUCTION=1 npm run test:e2e -- --grep "portal auth"`
  Expected: all pass. If `BUILD_ID` is missing, rebuild `@vfurst/web` first and do not count that run.

- [ ] **Step 4: Commit.**

  ```bash
  git add tests/e2e/portal-auth.spec.ts
  git commit -m "test(e2e): cover portal account setup, sign-in, reset, and isolation"
  ```

---

### Task 10: Closeout

**Files:**
- Modify: `PROGRESS.md`, `docs/plan/phase-1b-identity.md`

- [ ] **Step 1: Run the repository gates.**

  Run: `npx turbo run type-check lint test build --concurrency=1 --force; npm run test:boot-config`
  Expected: all pass. Only the known BullMQ warning is allowed. Record the counts.

- [ ] **Step 2: Run the host probe** from `docs/plan/verification.md` with `npm run dev` up.

  Expected: `200 200 200 200 400`.

- [ ] **Step 3: Run the full production E2E suite.**

  Run: `E2E_PRODUCTION=1 npm run test:e2e`
  Expected: 0 failed, 0 did not run. Record the totals: 118 previous plus the new spec. A known contention flake must pass on an isolated rerun and be reported as such, never silently.

- [ ] **Step 4: Update the documents.**
  - In `docs/plan/phase-1b-identity.md`, set the 1B.2 Plan cell to this file's link.
  - In `PROGRESS.md`:
    - Current phase: unit 1B.2 complete; next session is unit 1B.3 only, and its plan is written first.
    - The 1B row: `1B.1–1B.2 complete; 1B.3–1B.5 remain`.
    - A new session-log entry on top that records:
      - what was added;
      - the four deviations;
      - the baseline and final gate counts;
      - the E2E results in dev, production, and the full suite;
      - any stop point that was hit.

- [ ] **Step 5: Commit.**

  ```bash
  git add PROGRESS.md docs/plan/phase-1b-identity.md
  git commit -m "docs(progress): record phase 1B unit 1B.2"
  ```
