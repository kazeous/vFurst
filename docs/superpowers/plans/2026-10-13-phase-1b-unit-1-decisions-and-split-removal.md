# Phase 1B Unit 1B.1 — Decisions and Split-Runtime Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the Phase 1B identity decisions in the plan documents and delete the frozen split runtime, including the split-only `AuthorizationCode` model, without changing any behavior of `apps/web` or `apps/worker`.

**Architecture:** This unit only removes and documents; nothing new is built.

- The split apps, their tooling, and the split-only modules of `@vfurst/auth` and `@vfurst/contracts` are deleted.
- The `AuthorizationCode` model is removed from the schema.
- The identity-retention job shrinks to staff `Session` rows only.
- The plan documents are rewritten to the Phase 1B decisions, so the next sessions read the new contracts.

**Tech Stack:** npm workspaces + Turborepo, Prisma 6 (PostgreSQL, `db push`), Vitest, Next.js 15 (unchanged).

**Spec:** `docs/superpowers/specs/2026-10-13-identity-replatform-design.md` (§2, §5.4, §10, §13, §14)

## Global Constraints

- **Branch:** work on `feat/identity-replatform`. Do not push, merge, or open a PR into `staging` or `main`. The spec merges once, in unit 1B.5.
- **Keep:**
  - `@vfurst/auth` modules `core`, `invitations`, `public-account`, and `rate-limit`;
  - `@vfurst/contracts` modules `control-plane`, `public-api`, `queues`, and `webhooks`;
  - `@vfurst/tenant-context`;
  - the control-plane outbox and every control-plane consumer name. The spec's §3 lists them as out of scope.
- **Destructive flags:** the web `prestart` chain stays non-destructive. Never add `--accept-data-loss` or `--force-reset` to it.
- **Language:** documentation is written in English. Decision wording is copied from spec §2.
- **Gates** run serially: `npx turbo run <task> --concurrency=1`. The parallel run has a known `@vfurst/db/dist` clean race, recorded on 2026-07-30.
- **Commits** use conventional messages and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Docker containers from the user's other project ("pawket")** may hold ports 5432 and 6379. Ask the user before stopping them.

## Review Focus

1. **Stale lockfile.** If `package-lock.json` still lists `apps/platform-manager` or `apps/tenant-web`, `npm ci` fails in CI and in the Docker builds. Task 2 pins this with a lockfile grep and `npm ls`.
2. **Local schema push blocked.** `prisma db push` will not drop a non-empty `authorization_codes` table without a data-loss flag. Task 3 counts the rows first and stops if any exist.
3. **Retention broadening.** Removing the `authorizationCodes: { none: {} }` guard must not make any *other* session eligible for deletion. Task 3's test pins the exact `where` clause and the 30-day cutoff.
4. **`/start-phase` resolution.** `.agents/commands/start-phase.md` reads `docs/plan/phase-$ARGUMENTS.md`, so the new phase file must be exactly `docs/plan/phase-1b-identity.md`. Task 1 checks this.
5. **Leftover references.** Any remaining import, script, or config pointing at the split runtime breaks a later build or confuses the next session. Task 4 runs a repository-wide grep whose expected hits are listed exactly.

---

### Task 0: Preflight

**Files:** none

- [ ] **Step 1: Confirm branch and clean tree**

  Run: `git branch --show-current; git status --short`
  Expected: `feat/identity-replatform` and no output from `git status`.

- [ ] **Step 2: Confirm vFurst owns the local database and Redis ports**

  Run: `docker ps --format "{{.Names}} {{.Ports}}"`
  Expected: the vFurst compose containers (postgres, redis, minio, mailpit) hold 5432, 6379, 9000/9001, and 1025/8025. If a pawket container holds 5432 or 6379, stop and ask the user before doing anything else.
  If the vFurst stack is down, run `docker compose up -d`.

- [ ] **Step 3: Record the baseline gates**

  Run: `npx turbo run type-check lint test build --concurrency=1`
  Expected: everything passes. On 2026-07-30 the counts were type-check 9/9, lint 9/9, test 14/14 (web 190/190), build 10/10. Write the observed counts down for the PROGRESS entry in Task 4. If the baseline is red, stop and report it; do not start the removal on a red baseline.

---

### Task 1: Record the Phase 1B decisions in the plan documents

**Files:**
- Create: `docs/plan/phase-1b-identity.md`
- Modify:
  - `docs/plan/00-reference.md`
  - `docs/plan/phase-2-attendee-parity.md`
  - `docs/plan/02-concat-parity.md`
  - `docs/plan/verification.md`
  - `docs/plan/01-current-state.md`
  - `docs/plan/phase-6-launch.md`
  - `docs/launch/runtime-defect-audit-2026-07-26.md`
  - `docs/launch/go-live-checklist.md`
  - `AGENTS.md`

**Interfaces:**
- Produces:
  - the phase file path `docs/plan/phase-1b-identity.md`, which Task 4 and later units reference;
  - the unit table that later plans link to.

- [ ] **Step 1: Create `docs/plan/phase-1b-identity.md`**

  Sections, in order:
  1. Title `# Phase 1B — Identity re-platform`.
  2. A quote block containing:
     - the goal sentence (staff sign in only through the studio authentik; attendees, volunteers, and vendors use tenant-scoped portal accounts);
     - `Design (authoritative): docs/superpowers/specs/2026-10-13-identity-replatform-design.md — read the sections the active unit names; do not re-derive decisions.`;
     - `Precondition: Phase 1 complete (2026-07-29).`
  3. `## Decisions (recorded 2026-10-13)`: one bullet per spec decision D1–D11, each a single sentence copied from spec §2.
  4. `## Units`: the five-row table from spec §13 (Unit / Scope / System state afterwards), plus a fourth column `Plan`. 1B.1 links to this plan file; the other rows say `written at unit start`.
  5. `## Exit criteria`: the phase-completion list from spec §12, "Phase gates", as a numbered list.
  6. `## Branch and deployment`: `feat/identity-replatform`; one merge into `staging` in 1B.5; the deployed database is reset once in 1B.5; `prestart` stays non-destructive.

- [ ] **Step 2: Update `docs/plan/00-reference.md`**

  1. Under the opening quote block, add:
     `> **Phase 1B (2026-10-13)** supersedes the identity, surface, checkout-identity, and split-runtime decisions below; design in docs/superpowers/specs/2026-10-13-identity-replatform-design.md.`
  2. Document map: add rows for `docs/plan/phase-1b-identity.md` ("Identity re-platform phase, between Phase 1 and Phase 2") and for the spec ("Authoritative Phase 1B design").
  3. Replace the **Surfaces** row text with:
     `/platform/* = operator control plane and /dashboard/* = membership-scoped organizer workspace, both on the central host for staff signed in through authentik. Each tenant portal host ({slug}.<root-domain> or an active custom domain) serves the public portal and that tenant's attendee account area (/account/*). There is no central attendee surface.`
  4. Replace the **Checkout identity** row text with:
     `Authenticated checkout only, per tenant. Public submission/checkout requires a signed-in portal account of the organization that owns the event; records bind to that PortalAccount. No guest checkout. Checkout pages live on the tenant's canonical portal host.`
  5. Replace the **Split runtime** row text with:
     `Removed in Phase 1B unit 1B.1 (2026-10-13). apps/web is the only serving runtime; staff identity moved to authentik and attendee identity to portal accounts.`
  6. Add a new row **Identity** directly after **Checkout identity**:
     `Two audiences, two systems. Staff and operators (anyone using /dashboard or /platform) sign in only through the studio authentik (account.reyuugames.com, OIDC); vFurst stores no staff password and derives PLATFORM_ADMIN from an authentik group. Attendees, volunteers, and vendors use PortalAccounts unique per (organization, email), independent across tenants, verified email-first. Until unit 1B.4 lands, staff still use the legacy credentials sign-in.`
  7. Product/access model code block: change the "Public users" line to `Attendees — tenant-scoped portal accounts: registrations, orders, hotel bookings, volunteer/vendor applications, self-service account on that tenant's portal`.
  8. Replace the first non-negotiable rule with:
     `A User is a staff identity provisioned from authentik and grants nothing by itself. A PortalAccount is an attendee identity of one organization and can never hold membership, dashboard access, or platform roles.`
  9. Role matrix, last row: replace the cells with `Via a portal account` for the four staff columns and `Yes (portal account)` for Public user.
  10. Tech stack:
      - Monorepo row: drop `apps/platform-manager + apps/tenant-web [frozen]`.
      - Auth row becomes: `Staff: Auth.js v5 + authentik OIDC (JWT bound to a DB Session, authVersion invalidation, back-channel logout). Attendees: first-party portal sessions (hashed opaque host-only cookie token, organization-bound) over PortalAccount. Hashed single-use invitation/setup/reset/transfer tokens.`
  11. Data model:
      - `(49 models)` becomes `(48 models)`;
      - remove `AuthorizationCode` from the identity/tenancy line;
      - append the sentence `Phase 1B adds PortalAccount, PortalSession, and PortalAccountToken and moves attendee ownership columns to them (spec §5).`
  12. Email delivery contract: add the bullet `Portal account setup, password-reset, and account-exists messages (Phase 1B) go through the tenant's provider, are never replayable, and purge their payload on terminal states.`
  13. Project structure block:
      - delete the `platform-manager/, tenant-web/` line;
      - change the `auth/, contracts/, tenant-context/` comment to `# auth helpers (hashing, tokens, invitations, rate limit), queue/control-plane/webhook contracts, host classification`.

- [ ] **Step 3: Update `docs/plan/phase-2-attendee-parity.md`**

  - Precondition line: `Phase 1 complete.` becomes `Phase 1B (identity re-platform) complete.`
  - Attendee-profile row:
    - "owned by a `User`; `Registration` gains `attendeeProfileId` while keeping `userId` as the owning account" becomes "owned by a `PortalAccount` (Phase 1B); `Registration` gains `attendeeProfileId` while keeping `portalAccountId` as the owning account";
    - prefix the row with `**Amended 2026-10-13 (Phase 1B).**`.
  - Transfer/profile row: append `Transfers stay within one tenant (Phase 1B).`
  - 2FA row: replace the text with `**Amended 2026-10-13 (Phase 1B).** Staff 2FA belongs to authentik. REG-P9 covers portal accounts only: optional TOTP per account; passkeys later.`
  - i18n row: append `Phase 1B portal sign-in pages ship in English and are translated in unit 2.6.`
  - Unit 2.1 scope: "backfill a profile per existing registration from its user" becomes "from its portal account".
  - Unit 2.5 scope: `2FA for portal accounts per the decision above (enrollment, challenge, recovery codes, account-settings page).`
  - Exit criterion 5: `2FA login` becomes `portal-account 2FA login`.

- [ ] **Step 4: Update `docs/plan/02-concat-parity.md`**

  - Transfer row: append ` · scoped to one tenant from Phase 1B`.
  - "Two-factor authentication page" row: `❌ → **REG-P9** (portal accounts; staff 2FA via authentik — Phase 1B)`.
  - REG-P9 backlog row: `Two-factor authentication for portal accounts (staff 2FA via authentik)`.
  - "One account registers up to 4 attendees" row: "hard-bound to the session `User`" becomes "hard-bound to one account (`PortalAccount` from Phase 1B)".

- [ ] **Step 5: Update `docs/plan/verification.md`**

  - Tenant/authorization gates, first bullet becomes: `A portal account can never gain membership, dashboard access, platform roles, or org/event creation; staff identities exist only through authentik.`
  - Retitle the manual walkthrough to `Manual walkthrough (Phase 1B completion and later; plain npm run dev, no injected env)` and replace its steps with:
    1. On `{slug}.localhost:3000`, sign up with an email, then sign up again with the same email. Both show "Check your email"; Mailpit shows a setup link.
    2. Follow the link and set a name and password. Sign out. Sign in with a wrong password (inline message), then correctly. Signing up again now sends an "account exists" notice.
    3. The portal `/account` renders its summary cards. The same email on a second tenant is a separate account.
    4. `localhost:3000/{slug}` redirects to the tenant host.
    5. Registration with an invalid voucher, then a valid free registration (confirmation email in Mailpit).
    6. Store: add to cart, try a bad discount code, check out on the tenant host.
    7. Hotel booking. Volunteer application with a required field left blank.
    8. Staff: sign in at `/login` through the mock OIDC, reach `/dashboard`, log out.
  - Per-phase checkpoints: add the row `| 1B | Staff sign-in only via OIDC (mock locally, authentik deployed) incl. group → PLATFORM_ADMIN, invitation requires verified email, single logout, back-channel revocation; portal email-first setup/sign-in/reset; cross-tenant account independence; composite FKs reject cross-tenant owners; checkout on the portal host; full E2E and k6 500/50 green; deployed smoke per docs/launch/authentik-setup.md |` between the rows for phases 1 and 2.

- [ ] **Step 6: Update the remaining documents**

  - **`docs/plan/01-current-state.md`.** This is pulled forward from 1B.5 because the paragraph would otherwise describe deleted code.
    - Replace the "**Split runtime (frozen)**" paragraph with `**Split runtime** — removed in Phase 1B unit 1B.1 (2026-10-13); apps/web is the only serving runtime.`
    - Delete the `npm run test:split-topology` row from the evidence table.
  - **`docs/plan/phase-6-launch.md`.** Replace the entry-condition bullet that begins "A cutover decision for the frozen split runtime" with `Phase 1B complete. The split runtime was removed in unit 1B.1, so no cutover decision remains.`
  - **`docs/launch/go-live-checklist.md`.**
    - Delete ", a recorded split-runtime launch decision," from the line beginning "The deployed persona/tenant-isolation matrix".
    - Delete "the split-runtime launch decision, " from the line beginning "Mandatory evidence not parsed by the checker".
  - **`docs/launch/runtime-defect-audit-2026-07-26.md`.** Directly under the `## SPL — Split runtime` heading and under the `## Batch 6 — Split-runtime hardening` heading, insert:
    `**Withdrawn 2026-10-13.** The split runtime was removed in Phase 1B unit 1B.1 (docs/superpowers/specs/2026-10-13-identity-replatform-design.md §10). SPL-01…SPL-11 no longer apply; the split architecture documents referenced below were deleted and remain in git history.`
  - **`AGENTS.md`.**
    - In the plan-file list, add `docs/plan/phase-1b-identity.md` (identity re-platform, between phases 1 and 2) and the spec path.
    - Change the reading rule to: "read `PROGRESS.md`, then `00-reference.md`, then only the active phase file — in Phase 1B also the spec sections the active unit names".
    - Delete working rule 8, keeping rules 1–7 numbered as they are.
    - Delete the split-runtime row from the environment table.
    - Ports paragraph becomes: `Ports in local development: apps/web 3000. apps/web silently retries onto another port when 3000 is taken, while AUTH_URL keeps pointing at 3000.`

- [ ] **Step 7: Verify file naming and leftover references in the plan documents**

  Run: `test -f docs/plan/phase-1b-identity.md && echo ok; git grep -n "frozen" -- docs/plan/00-reference.md AGENTS.md`
  Expected: `ok` and no `frozen` hits.

- [ ] **Step 8: Commit**

  ```bash
  git add docs/plan AGENTS.md docs/launch/runtime-defect-audit-2026-07-26.md docs/launch/go-live-checklist.md
  git commit -m "docs(plan): record phase 1B identity decisions"
  ```

---

### Task 2: Delete the split runtime and its split-only package modules

**Files:**
- Delete:
  - `apps/platform-manager/`, `apps/tenant-web/`
  - `scripts/split/`, `scripts/run-split-e2e.mjs`, `playwright.split.config.mjs`
  - `tests/split-e2e/`, including the untracked `tsconfig.tsbuildinfo`
  - `docs/architecture/app-split-inventory-2026-07-17.md`, `docs/architecture/app-split-plan-2026-07-17.md`
  - `packages/auth/src/authorization-code.ts`, `authorization-transaction.ts`, `identity-assertion.ts`, `tenant-session.ts`, and the tests `authorization-code.test.ts`, `authorization-transaction.test.ts`, `tenant-session.test.ts`
  - `packages/contracts/src/auth.ts`, `service.ts`, `operational-events.ts`, `operational-events.test.ts`. These have no consumer outside the split apps, which was verified on 2026-10-13. Spec §10 names only the auth contracts; `service` and `operational-events` are the same split-only class.
- Modify:
  - `package.json`: remove the scripts `predev:split`, `dev:split`, `build:split`, `test:split-topology`, and `test:e2e:split`
  - `turbo.json`: remove the `@vfurst/platform-manager#test` and `@vfurst/tenant-web#test` tasks
  - `eslint.config.mjs`: the Next.js block's `files` becomes `["apps/web/**/*.{ts,tsx}"]`
  - `packages/auth/src/index.ts`: re-export only `core`, `invitations`, `public-account`, `rate-limit`
  - `packages/auth/package.json`: remove the four split subpath exports and the `@vfurst/contracts` dependency
  - `packages/contracts/src/index.ts`: re-export only `control-plane`, `public-api`, `queues`, `webhooks`
  - `packages/contracts/src/contracts.test.ts`: delete the four authorization tests ("accepts a bounded tenant-web authorization request", "rejects non-HTTPS remote callback URLs", "retains authVersion in authorization-code claims", "allows HTTP callbacks only for loopback and localhost subdomains") and their now-unused imports
  - `package-lock.json`: regenerated

**Interfaces:**
- Produces:
  - `@vfurst/auth` exports exactly `./core`, `./invitations`, `./public-account`, `./rate-limit`, plus the root.
  - `@vfurst/contracts` exports control-plane, public-api, queues, and webhooks symbols only.

- [ ] **Step 1: Delete the files and directories listed above**

  Run:
  ```bash
  git rm -r -q apps/platform-manager apps/tenant-web scripts/split scripts/run-split-e2e.mjs playwright.split.config.mjs tests/split-e2e docs/architecture packages/auth/src/authorization-code.ts packages/auth/src/authorization-code.test.ts packages/auth/src/authorization-transaction.ts packages/auth/src/authorization-transaction.test.ts packages/auth/src/identity-assertion.ts packages/auth/src/tenant-session.ts packages/auth/src/tenant-session.test.ts packages/contracts/src/auth.ts packages/contracts/src/service.ts packages/contracts/src/operational-events.ts packages/contracts/src/operational-events.test.ts
  rm -rf apps/platform-manager apps/tenant-web tests/split-e2e
  ```

  The second command removes ignored leftovers such as `node_modules`, `.next`, and `tsbuildinfo`.

- [ ] **Step 2: Apply the configuration and index edits listed under "Modify"**

- [ ] **Step 3: Regenerate the lockfile**

  Run: `npm install`
  Then run: `grep -c -E "apps/(platform-manager|tenant-web)" package-lock.json; npm ls --depth=0 >/dev/null && echo tree-ok`
  Expected: `0` and `tree-ok`.

- [ ] **Step 4: Run the repository gates**

  Run: `npx turbo run type-check lint test build --concurrency=1`
  Expected:
  - PASS with two fewer workspaces than the baseline: build 8/8; type-check and lint each two fewer than baseline;
  - web unit tests unchanged from the baseline (190/190 on 2026-07-30);
  - the auth and contracts suites pass without the deleted tests.

  A failure that names a deleted symbol means a consumer was missed. Restore nothing; fix the consumer, or stop and report if it is outside this unit's scope.

- [ ] **Step 5: Commit**

  ```bash
  git add -A
  git commit -m "chore: remove frozen split runtime"
  ```

---

### Task 3: Retire the `AuthorizationCode` model and shrink identity retention to staff sessions

**Files:**
- Modify:
  - `packages/db/prisma/schema.prisma`: delete `model AuthorizationCode`, the `authorizationCodes AuthorizationCode[]` field on `User`, and the same field on `Session`
  - `packages/db/src/identity-retention.ts`
  - `packages/db/src/index.ts`: drop `export * from "./authorization-codes.js";`
  - `apps/worker/src/jobs/cleanup-identity-protocol-records.ts`
- Delete: `packages/db/src/authorization-codes.ts`, `packages/db/src/authorization-codes.test.ts`
- Test: `packages/db/src/identity-retention.test.ts`, `apps/worker/src/jobs/cleanup-identity-protocol-records.test.ts`

**Interfaces:**
- Produces. These are the shapes 1B.2 extends with portal sessions and tokens:
  - `CleanupIdentityProtocolRecordBatchInput = Readonly<{ now?: Date; identitySessionRetentionMs?: number; batchSize?: number }>`
  - `CleanupIdentityProtocolRecordBatchResult = Readonly<{ identitySessionsSelected: number; identitySessionsDeleted: number; hasMore: boolean }>`
  - `cleanupIdentityProtocolRecordBatch(client: PrismaClient, input?: CleanupIdentityProtocolRecordBatchInput): Promise<CleanupIdentityProtocolRecordBatchResult>`
  - `processCleanupIdentityProtocolRecords(input?)` resolves to `Readonly<{ batches: number; identitySessionsDeleted: number; batchBudgetExhausted: boolean }>`
  - `DEFAULT_AUTHORIZATION_CODE_RETENTION_MS` is removed. `DEFAULT_IDENTITY_SESSION_RETENTION_MS` (30 days), `DEFAULT_IDENTITY_RETENTION_BATCH_SIZE` (250), and `MAX_IDENTITY_RETENTION_BATCH_SIZE` (1000) are unchanged.

- [ ] **Step 1: Write the failing retention tests.** Replace the body of `packages/db/src/identity-retention.test.ts`.

  ```ts
  // imports: cleanupIdentityProtocolRecordBatch, DEFAULT_IDENTITY_SESSION_RETENTION_MS
  const sessionCutoff = new Date(now.getTime() - DEFAULT_IDENTITY_SESSION_RETENTION_MS);
  const eligibility = { OR: [{ expires: { lte: sessionCutoff } }, { revokedAt: { lte: sessionCutoff } }] };

  it("deletes only a bounded, rechecked batch of long-expired or long-revoked staff sessions", async () => {
    const tx = { session: { findMany: vi.fn().mockResolvedValue([{ id: oldSessionId }]), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    await expect(cleanupIdentityProtocolRecordBatch(clientWithTransaction(tx), { now, batchSize: 25 }))
      .resolves.toEqual({ identitySessionsSelected: 1, identitySessionsDeleted: 1, hasMore: false });
    expect(tx.session.findMany).toHaveBeenCalledWith({ where: eligibility, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 25 });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [oldSessionId] }, ...eligibility } });
  });

  it("is idempotent on an empty batch", async () => {
    const tx = { session: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() } };
    await expect(cleanupIdentityProtocolRecordBatch(clientWithTransaction(tx), { now }))
      .resolves.toEqual({ identitySessionsSelected: 0, identitySessionsDeleted: 0, hasMore: false });
    expect(tx.session.deleteMany).not.toHaveBeenCalled();
  });

  it("signals another batch when a full batch was selected", async () => {
    const tx = { session: { findMany: vi.fn().mockResolvedValue([{ id: oldSessionId }]), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    await expect(cleanupIdentityProtocolRecordBatch(clientWithTransaction(tx), { now, batchSize: 1 }))
      .resolves.toMatchObject({ hasMore: true });
  });

  it("rejects unbounded batches and sub-minute retention", async () => {
    const client = clientWithTransaction({});
    await expect(cleanupIdentityProtocolRecordBatch(client, { now, batchSize: 1_001 })).rejects.toThrow(/batchSize/);
    await expect(cleanupIdentityProtocolRecordBatch(client, { now, batchSize: 0 })).rejects.toThrow(/batchSize/);
    await expect(cleanupIdentityProtocolRecordBatch(client, { now, identitySessionRetentionMs: 59_999 })).rejects.toThrow(/identitySessionRetentionMs/);
  });
  ```

  Keep the existing `now`, `oldSessionId`, and `clientWithTransaction` helpers.

  In `cleanup-identity-protocol-records.test.ts`:
  - `batchResult(identitySessionsDeleted: number, hasMore: boolean)` returns `{ identitySessionsSelected: identitySessionsDeleted, identitySessionsDeleted, hasMore }`.
  - The three expectations drop `authorizationCodesDeleted`:
    - first test: `{ batches: 2, identitySessionsDeleted: 7, batchBudgetExhausted: false }` from results `(5, true)` then `(2, false)`;
    - second test: `{ batches: 3, identitySessionsDeleted: 0, batchBudgetExhausted: true }`;
    - third test: zeros.

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `npx vitest run src/identity-retention.test.ts` (in `packages/db`) and `npx vitest run src/jobs/cleanup-identity-protocol-records.test.ts` (in `apps/worker`)
  Expected: FAIL. The implementation still reads `tx.authorizationCode` and returns `authorizationCodes*` fields.

- [ ] **Step 3: Implement the sessions-only retention**

  In `identity-retention.ts`:
  - remove the authorization-code constant, input, validation, and query half;
  - the session eligibility becomes exactly the `OR` of `expires <= cutoff` and `revokedAt <= cutoff`, with no relation guard;
  - `hasMore` is `identitySessionIds.length === batchSize`;
  - update the doc comment to say the job prunes staff identity sessions (portal records join in 1B.2).

  In the worker job, drop the `authorizationCodesDeleted` accumulator and output field.

- [ ] **Step 4: Delete the authorization-code module and its schema model**

  Delete `packages/db/src/authorization-codes.ts` and its test. Edit `index.ts` and `schema.prisma` as listed under "Files".

- [ ] **Step 5: Run the database and worker checks**

  Run: `npm run db:validate; npx turbo run type-check test --filter=@vfurst/db --filter=@vfurst/worker --concurrency=1`
  Expected: the schema is valid, type-check passes, and both retention suites pass.

- [ ] **Step 6: Check that the local table is empty, then sync the local schema**

  Run: `docker compose exec -T postgres psql -U postgres -d vfurst -tAc 'SELECT count(*) FROM authorization_codes'`. The compose service, user, and database match `DIRECT_DATABASE_URL` in `.env.local`.
  Expected: `0`. If the count is greater than 0, stop and ask the user. Do not add a data-loss flag.

  Then run: `npm run prestart --workspace @vfurst/web`
  Expected: completes. Prisma drops `authorization_codes` without a data-loss prompt.

- [ ] **Step 7: Commit**

  ```bash
  git add -A packages/db apps/worker
  git commit -m "refactor(db): retire split authorization codes"
  ```

---

### Task 4: Session closeout — full gates, reference sweep, PROGRESS

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Run the full repository gates and the boot smoke**

  Run: `npx turbo run type-check lint test build --concurrency=1; npm run test:boot-config`
  Expected: all pass. Record the exact counts. The known BullMQ dynamic-dependency warning is allowed; any new warning blocks.

- [ ] **Step 2: Sweep for leftover split references**

  Run:
  ```bash
  git grep -n -I -E "platform-manager|tenant-web|split-topology|dev:split|build:split|test:e2e:split|run-split-e2e|playwright\.split|scripts/split|AuthorizationCode|authorization-codes" -- . ':!package-lock.json' ':!docs/superpowers' ':!PROGRESS.md' ':!docs/launch/runtime-defect-audit-2026-07-26.md' ':!docs/launch/security-audit.md' ':!docs/plan/phase-1-stabilize.md'
  ```
  Expected: hits only in `packages/db/src/control-plane-outbox.test.ts`, the consumer name `tenant-web:tenant-directory`. Control-plane naming is out of scope per spec §3. Any other hit must be fixed before continuing.

- [ ] **Step 3: Update `PROGRESS.md`**

  - **Current phase:** `**Phase 1B — Identity re-platform: In progress** (docs/plan/phase-1b-identity.md; design docs/superpowers/specs/2026-10-13-identity-replatform-design.md). Unit 1B.1 complete on feat/identity-replatform (not merged). **Next session: unit 1B.2 only** — write its plan from spec §5.2, §7, §8.3, §13 first.`
  - **Status table:**
    - add the row `| 1B — Identity re-platform | In progress | 1B.1 complete; 1B.2–1B.5 remain; merge to staging once in 1B.5 |` after Phase 1;
    - the Phase 2 note becomes `Blocked on Phase 1B`;
    - the Phase 3 note "Blocked on Phase 1" becomes "Blocked on Phase 1B".
  - **Session log entry `### 2026-10-13 — Phase 1B design and unit 1B.1`.** It records:
    - the user's identity decisions (spec §2);
    - the spec and plan paths;
    - the deletions (split apps, split tooling, split-only auth and contracts modules, `AuthorizationCode`);
    - the retention change;
    - the documentation updates, including the three items pulled forward from 1B.5 (`01-current-state`, `phase-6-launch`, `go-live-checklist`);
    - the exact gate counts from Step 1;
    - the baseline counts from Task 0;
    - the clean reference sweep.

- [ ] **Step 4: Commit**

  ```bash
  git add PROGRESS.md
  git commit -m "docs(progress): record phase 1B unit 1B.1"
  ```
