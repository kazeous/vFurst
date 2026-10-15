# Identity re-platform — design (Phase 1B)

> **Status:** design approved in conversation on 2026-10-13 (sections a–e); this written spec awaits review.
> **Placement:** "Phase 1B — Identity re-platform", between Phase 1 (complete) and Phase 2 (not started).
> **Branch:** `feat/identity-replatform`, cut from `staging`; merged back to `staging` once, in unit 1B.5.

## 1. Intent

**What the user asked for (2026-10-13):**

- Remove vFurst's own account system for staff and operators. Use the studio's central identity at `account.reyuugames.com`: authentik **2025.10.3**, over OIDC.
- Public attendees (ticket buyers) do **not** use the studio identity. They register and sign in with an account that belongs to **one tenant**. The same email address at two tenants gives two unrelated accounts.
- Volunteers and vendors/dealers also use tenant accounts. Only people who operate `/dashboard` or `/platform` use authentik.

**Success looks like:**

- A Reyuu Games account signs in to `/dashboard` and `/platform`. No password form for staff exists anywhere in vFurst.
- An attendee goes to `{slug}.vfurst.reyuugames.com` and:
  - creates an account by proving they own the mailbox,
  - sets a password,
  - buys a ticket,
  - sees the ticket under that portal's `/account`.

  The same email at another tenant is a separate, unrelated account.
- Tenant isolation of attendee data is enforced by the database itself, not only by application code.
- The full production E2E suite is green, and the 500/50 load proof passes.

**Assumptions confirmed during design:**

- All existing data on every environment is test data. There is no data migration; databases are reset.
- Organization roles (`OWNER`/`ADMIN`/`MEMBER`) stay in vFurst. authentik decides who a staff member is, and vFurst decides what they may do.

## 2. Decisions

| ID | Decision |
|---|---|
| D1 | Staff and operators authenticate only through authentik over OIDC. vFurst stores no staff password. |
| D2 | Attendees, volunteers, and vendors use tenant-scoped accounts, unique per `(organization, email)` and fully independent across tenants. There is no platform-level linking. |
| D3 | Attendee sign-in uses email and password, and the email must be verified. Verification happens **email-first**: the mailbox is proven before any password exists. |
| D4 | `PLATFORM_ADMIN` comes from membership of an authentik group and is re-synchronized at every staff sign-in. |
| D5 | Signing out of vFurst also ends the authentik session (single logout). |
| D6 | Two separate identity tables: `User` holds staff identity, `PortalAccount` holds attendee identity. ("Model 1" in the design discussion.) |
| D7 | The split runtime (`apps/platform-manager`, `apps/tenant-web`) is removed, not just left frozen. |
| D8 | Portals live at `{slug}.vfurst.reyuugames.com`, plus platform-activated custom domains. The deployed root domain becomes `vfurst.reyuugames.com`. |
| D9 | The public API and webhook payloads keep the field name `userId`. Its value is now the tenant-scoped portal account ID. |
| D10 | Local development and E2E use a mock OIDC server. The real authentik is exercised only by the deployed smoke test. |
| D11 | The work is "Phase 1B — Identity re-platform". It lands on `feat/identity-replatform` and merges to `staging` once. |

**Standing decisions this supersedes.** Unit 1B.1 rewrites them in `docs/plan/00-reference.md`:

- "Checkout identity": checkout no longer requires a signed-in **central** account. It requires a signed-in **portal** account of the order's tenant.
- "Surfaces": `/account/*` is no longer a central surface. Each portal has its own `/account`.
- "Split runtime": changes from frozen to **removed**.
- "Non-negotiable authorization rules": restated as follows. A `PortalAccount` can never hold organization membership. Staff identities exist only through authentik.
- Tech stack, "Auth" row: Auth.js v5 with the authentik provider for staff, and a first-party portal session for attendees.

**Phase 2 decisions this adjusts.** Unit 1B.1 records the changes in `docs/plan/phase-2-attendee-parity.md`:

- `AttendeeProfile` is owned by a `PortalAccount`.
- `maxRegistrationsPerUser` counts per `PortalAccount`.
- Transfers happen within one tenant only.
- REG-P9 (2FA) covers portal accounts only. Staff 2FA belongs to authentik.
- The new Phase 1B portal pages are written in English, matching the current UI. Unit 2.6 translates them.

## 3. Non-goals

- Migrating or linking existing users. Data is reset (§5.6).
- Changing a portal account's email address. This needs its own verification flow; it can be scheduled later.
- 2FA for portal accounts. That is Phase 2, REG-P9.
- Social login for attendees.
- Cross-tenant attendee identity, platform-wide bans, or cross-tenant analytics.
- Automating TLS for per-tenant custom domains. This is unchanged from today.
- Making authentik back-channel logout the **only** revocation mechanism. The 12-hour session cap remains the baseline (§6.3).
- Changing the control-plane outbox. Web and worker still use it, and it is out of scope.

## 4. Architecture overview

```text
                         ┌───────────────────────────────────────┐
 staff / operators ────► │ vfurst.reyuugames.com (central host)  │ ──OIDC (PKCE)──► account.reyuugames.com
                         │  /login  /invitations  /dashboard     │ ◄─back-channel logout (signed JWT)──
                         │  /platform  marketing  /api/*         │
                         │  Auth.js JWT + DB-bound Session → User│
                         └───────────────────────────────────────┘
                         ┌───────────────────────────────────────┐
 attendees ────────────► │ {slug}.vfurst.reyuugames.com          │
 volunteers, vendors     │   or the tenant's ACTIVE custom domain│
                         │  portal pages, /login, /signup,       │
                         │  /forgot-password, /set-password,     │
                         │  /account/*, /checkout/[orderId]      │
                         │  PortalSession cookie → PortalAccount │
                         └───────────────────────────────────────┘
 vfurst.reyuugames.com/{slug}/…  ── 308 ──►  canonical portal host (same suffix)
```

`apps/web` remains the only serving runtime. Its middleware already classifies hosts and rewrites tenant hosts to `/{slug}/…`. The worker keeps its topology.

## 5. Data model

`packages/db/prisma/schema.prisma` remains the single source of truth. This section defines the target shape.

### 5.1 Staff identity: `User`

- **Kept:**
  - `id`, `email @unique`, `name?`, `image?`.
  - `emailVerified DateTime?`. It mirrors authentik's `email_verified` claim at every sign-in: set when the claim is true, `null` when it is not.
  - `authVersion`, `platformRole`, timestamps.
- **Removed:** `passwordHash`, `avatar`.
- **Link to authentik:** through the existing Auth.js `Account` row with `provider = "authentik"` and `providerAccountId = <sub>`. Users are looked up by `sub`, so an email change in authentik never breaks the link.
- **Relations that remain on `User`:**
  - `Account`, `Session`, `OrgMember`.
  - `OrgInvitation` (invitedBy / acceptedBy / revokedBy).
  - `RegistrationTransferRequest.requester` (the staff member who started the transfer; see the §5.3 amendment).
  - `Organization` audit fields (statusUpdatedBy, customDomainVerifiedBy, customDomainActivatedBy).
  - `Department.lead`, `VolunteerApplication.reviewedBy`, `AttendeeNote.author`, `EmailDelivery.replayedBy`.
  - `PaymentProviderConfig.updatedBy`, `PaymentException.resolvedBy`, `OrganizerPayout.createdBy`, `PaymentRefund.createdBy`.
  - `ControlPlaneOutboxEvent.actorUserId`, which has no foreign key.
- **Staff identity `Session` gains two columns:**
  - `oidcSid String?`, indexed. It holds the `sid` claim when authentik provides one.
  - `idToken String? @db.Text`. It is used only as `id_token_hint` at logout and is set to `null` when the session is revoked.

### 5.2 Attendee identity: three new models

```prisma
enum PortalAccountTokenPurpose {
  ACCOUNT_SETUP   // sign-up and walk-in claim
  PASSWORD_RESET
}

model PortalAccount {
  id              String    @id @default(uuid()) @db.Uuid
  orgId           String    @db.Uuid
  email           String    // normalizeIdentityEmail()
  name            String?
  passwordHash    String?   // null = unclaimed (walk-in or setup not finished)
  emailVerifiedAt DateTime? // set together with passwordHash
  authVersion     Int       @default(0)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  org             Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  // owner relations listed in §5.3, plus sessions and tokens

  @@unique([orgId, email])
  @@unique([orgId, id])          // target of the composite foreign keys
  @@map("portal_accounts")
}

model PortalSession {
  id              String    @id @default(uuid()) @db.Uuid
  orgId           String    @db.Uuid
  portalAccountId String    @db.Uuid
  tokenHash       String    @unique @db.Char(64)   // SHA-256 hex of the cookie value
  authVersion     Int
  expiresAt       DateTime
  revokedAt       DateTime?
  createdAt       DateTime  @default(now())
  // composite relation (orgId, portalAccountId) → PortalAccount(orgId, id)
  @@index([portalAccountId])
  @@index([expiresAt])
  @@map("portal_sessions")
}

model PortalAccountToken {
  id              String                    @id @default(uuid()) @db.Uuid
  orgId           String                    @db.Uuid
  portalAccountId String                    @db.Uuid
  purpose         PortalAccountTokenPurpose
  tokenHash       String                    @unique @db.Char(64)
  expiresAt       DateTime
  consumedAt      DateTime?
  createdAt       DateTime                  @default(now())
  // composite relation (orgId, portalAccountId) → PortalAccount(orgId, id)
  @@index([portalAccountId, purpose])
  @@index([expiresAt])
  @@map("portal_account_tokens")
}
```

**Invariant:** `passwordHash != null` implies `emailVerifiedAt != null`.

- The only code that writes `passwordHash` is `setPortalAccountPassword()`. It sets both fields in the same update, and unit tests cover the invariant.
- No database CHECK constraint is added. `prisma db push` does not manage CHECK constraints, and the project avoids constraints that live outside the schema.

### 5.3 Ownership columns that move to `PortalAccount`

| Model | Before | After |
|---|---|---|
| `Registration` | `userId` → User | `portalAccountId` |
| `Cart` | `userId`, `@@unique([userId, eventId])` | `portalAccountId`, `@@unique([portalAccountId, eventId])` |
| `Order` | `userId` | `portalAccountId` |
| `HotelBooking` | `userId` | `portalAccountId` |
| `VolunteerApplication` | `userId` | `portalAccountId` |
| `VendorApplication` | `userId` | `portalAccountId` |
| `StaffAssignment` | `userId` | `portalAccountId` |
| `RaffleEntry` | `userId`, `@@index([raffleId, userId])` | `portalAccountId`, `@@index([raffleId, portalAccountId])` |
| `RaffleDrawResult` | `winnerUserId`, `@@unique([raffleId, winnerUserId])` | `winnerAccountId`, `@@unique([raffleId, winnerAccountId])` |
| `RegistrationTransferRequest` | `recipientUserId?` | `recipientAccountId?` (`recipientEmail` stays; `requesterUserId` stays on `User`, see below) |

**Amended 2026-10-15 (unit 1B.3 plan):** `RegistrationTransferRequest.requesterUserId` is **not** an attendee column. Staff create every transfer request from the dashboard (`createRegistrationTransferRequest` takes the requester from `requireRegistrationAccess`, and the E2E fixtures seed the organization owner). The column therefore keeps its name and its relation to `User`, like the other staff audit fields in §5.1. Only the recipient moves to `PortalAccount`.

Every relation in the table, plus `PortalSession` and `PortalAccountToken`, is a **composite** foreign key:

**Amended 2026-10-14 (unit 1B.2):** `PortalSession` and `PortalAccountToken` keep the composite key but use `onDelete: Cascade`. Nothing cascades into them from `Organization`, so `NoAction` would fail organization deletion. `NoAction` remains the rule for the business tables listed above.

```prisma
portalAccount PortalAccount @relation(fields: [orgId, portalAccountId], references: [orgId, id], onDelete: NoAction)
```

- **Purpose:** the database refuses any row whose owner account belongs to a different organization than the row itself.
- **Why `NoAction`:** PostgreSQL checks NO ACTION at the end of the statement. Deleting an `Organization` can therefore cascade through both the owning rows and `PortalAccount` within one statement, and the DAT-01 organization-deletion regression stays green. `Restrict` would fail partway through the cascade. `SetNull` would try to set the shared `orgId` to null.
- **Deleting a `PortalAccount`:** no feature does this, so an account that is still referenced cannot be deleted. That is intended.
- **Why rename the columns:** the rename is deliberate. Every attendee call site that used `userId` stops compiling, so none can be missed.

### 5.4 Removed models and modules

- **In 1B.1, together with the split runtime:**
  - model `AuthorizationCode`, which only the split runtime uses;
  - `packages/db/src/authorization-codes.ts`;
  - the authorization-code half of `packages/db/src/identity-retention.ts`. It keeps pruning long-expired or revoked staff `Session` rows.
- **In 1B.2:** `identity-retention` also prunes `PortalSession` rows 30 days after expiry or revocation, and `PortalAccountToken` rows 7 days after expiry or consumption.
- **In 1B.4, together with the staff sign-in switch:**
  - model `Authenticator` (passkeys now belong to authentik);
  - model `VerificationToken` (only the central password reset uses it, and staff keep that until 1B.4);
  - `User.passwordHash` and `User.avatar`.

### 5.5 Indexes needed by hot paths

- Portal session lookup uses the unique `tokenHash`.
- Login uses `@@unique([orgId, email])`.
- Organizer search continues to use the organization-scoped indexes on owning rows.
- The existing composite index `@@index([eventId, userId, status])` on `Registration` becomes `@@index([eventId, portalAccountId, status])`.

### 5.6 Applying the change

- No data migration. When a unit makes a destructive schema change (1B.3, 1B.4), the local database is reset once with a documented `prisma db push --force-reset` against the local `DIRECT_DATABASE_URL`. The standard `prestart` chain then runs.
- The deployed database is reset once in 1B.5 (§13).
- The `prestart` chain itself stays non-destructive. It never gets a data-loss flag.

## 6. Staff identity (authentik)

### 6.1 Provider

- **Provider:** the Auth.js v5 `authentik` provider, configured from OIDC discovery at `AUTH_AUTHENTIK_ISSUER`. The authentik application slug is `vfurst`, so the deployed issuer is `https://account.reyuugames.com/application/o/vfurst/`.
- **Client:** confidential.
- **Checks:** PKCE and `state`.
- **Scopes:** `openid email profile`. authentik's `profile` scope carries `groups`.
- **Removed:** the `Credentials` and `Google` providers. If Google sign-in is wanted for staff, it is enabled inside authentik.
- **Adapter:** `PrismaAdapter` is wrapped so that `linkAccount` persists only `type`, `provider`, `providerAccountId`, and `userId`. Access, refresh, and ID tokens from authentik are never written to `Account`.

### 6.2 Sign-in and profile synchronization

1. **First sign-in** creates `User` and `Account(sub)` just in time.
2. **Every sign-in**, before the identity session is issued, synchronizes:
   - `email`, `name`, and `image` from the claims;
   - `emailVerified` from `email_verified`;
   - `platformRole`: `PLATFORM_ADMIN` if `groups` contains `VFURST_PLATFORM_ADMIN_GROUP`, otherwise `USER`.

   The per-request session check already reads `platformRole` from the database. A change in role therefore applies to every live session of that user immediately.
3. **Email conflict.** The claimed email may already belong to a different `User` whose `Account` has another `sub`, for example when an authentik account was deleted and recreated. In that case:
   - the `signIn` callback denies the sign-in by redirecting to `/login?error=StudioAccountConflict`;
   - `/login` shows an inline message telling the person to contact a platform administrator;
   - Sentry receives both user IDs and no tokens.

   There is no automatic linking by email.
4. **Post-sign-in routing** is unchanged: `PLATFORM_ADMIN` goes to `/platform`, an organization member to `/dashboard`, and anyone else sees the existing 403 screen.

### 6.3 Session lifetime and revocation

- **Unchanged mechanism:** the `identitySessionId` + `authVersion` binding, validated against the database on every request.
- **Lifetime:** at most `VFURST_STAFF_SESSION_MAX_AGE_SECONDS`, default **43200 (12 h)**, down from 30 days. On expiry, `/login` sends the person through authentik. If their authentik session is still alive, they come back without being prompted.
- **Revocation sources:**
  - vFurst logout (§6.5);
  - back-channel logout (§6.4);
  - an `authVersion` bump;
  - removal of the organization membership. Dashboard access is checked against the database on every request.

### 6.4 Back-channel logout endpoint

`POST /api/oidc/backchannel-logout` receives a form-encoded `logout_token` and handles it per OpenID Connect Back-Channel Logout 1.0.

**Validation.** The token is rejected unless all of these hold:

- the JWS signature verifies against the issuer JWKS;
- `iss` equals the configured issuer;
- `aud` contains the client ID;
- `iat` is within 5 minutes in the past and 1 minute in the future;
- `events` contains `http://schemas.openid.net/event/backchannel-logout`;
- at least one of `sub` or `sid` is present;
- `nonce` is **absent**.

**Replay protection:** `jti` is recorded in Redis for 10 minutes. If Redis is unavailable, the endpoint follows the existing signed-webhook policy: it fails open and logs that protection is degraded. A replayed token can only revoke sessions again.

**Effect:**

- With `sid`: revoke the identity sessions whose `oidcSid` matches, and whose user matches `sub` when `sub` is present.
- Without `sid`: increment `User.authVersion`, which invalidates every session of that `sub`.

**Responses:** `200` on success, `400` on an invalid token, always with `Cache-Control: no-store`.

authentik 2025.10 labels back-channel logout as **Preview**. That is why the 12-hour cap stays the baseline guarantee.

### 6.5 Logout

The staff logout control is a server action. It:

1. revokes the identity session (local first, so the logout holds even if the IdP step fails);
2. clears the Auth.js cookie;
3. redirects to the discovered `end_session_endpoint`, passing `id_token_hint`, `client_id`, and `post_logout_redirect_uri = <central origin>/`.

vFurst's authentik provider uses a **dedicated invalidation flow** containing a User Logout stage. Leaving vFurst therefore ends the authentik session (D5) without changing the studio's default flow for other applications.

### 6.6 Central pages

- `/login` offers one action, "Sign in with your Reyuu Games account". It:
  - preserves a validated `returnTo` (existing `safeReturnTo`);
  - renders Auth.js error codes inline (Phase 1 pattern).
- `/register`, `/forgot-password`, and `/reset-password` are removed from the central host in unit 1B.4.
- Staff profile data is managed in authentik. The dashboard links to the authentik user interface at the issuer origin plus `/if/user/`.
- Central marketing pages link only to staff sign-in.

### 6.7 Organization invitations

The flow keeps its shape: open the invitation link, sign in through authentik if needed, then accept. Acceptance now requires:

- the invitation is valid;
- `User.emailVerified` is set, meaning authentik asserted `email_verified: true`;
- the normalized emails match.

Errors use the existing redirect-with-code pattern (`EMAIL_MISMATCH`, plus a new `EMAIL_UNVERIFIED`).

authentik 2025.10 sends `email_verified: false` by default. The runbook (§11.3) therefore configures verification. Until it is configured, invitations **fail closed** with a clear message.

### 6.8 Unchanged staff semantics

- Department leads must still be organization members.
- Reviewer, author, and audit columns keep pointing to `User`.

## 7. Attendee identity (portal accounts)

### 7.1 Canonical portal host

- **Canonical host:** the organization's custom domain when its status is `ACTIVE`; otherwise `{slug}.<NEXT_PUBLIC_ROOT_DOMAIN>`.
- **Redirects** (308, path suffix and query preserved, introduced in 1B.3):
  - central-path portal URLs `<central>/{slug}/…` → canonical host;
  - subdomain URLs → the active custom domain.
- **Scope:** every attendee interaction happens on the canonical host: sign-in, account, checkout, email links, and payment return URLs. The central host serves no attendee identity.
- **Local development:** `{slug}.localhost:3000` already resolves to loopback.
- **Where the redirects run** *(amended 2026-10-15, unit 1B.3 plan)*: in the middleware, switched to the Node.js runtime (stable in Next.js 15.5) so that it can read the organization.
  - The `/{slug}/register` page is 15-second ISR and cannot read the request host. A page-level redirect would also lose the query, and the central path and the subdomain host render the same ISR entry.
  - Only `GET` and `HEAD` are redirected. Other methods pass through unchanged, and the Server Actions Origin check still applies to them.
  - On the central host, a first path segment is a portal candidate only when it is not a central route. The list of central route segments is pinned by a unit test that reads `apps/web/src/app`.
  - Organization lookups are cached in process for 15 seconds, the same window as the ISR. Only hits are cached.

### 7.2 Account setup (email-first)

- **Route:** `/signup` collects **only an email**.
- **Response:** whatever the account state, the person sees "Check your email". The server then takes one of these branches:

| Account state for `(org, email)` | Action |
|---|---|
| none | Create an unclaimed `PortalAccount`; email an `ACCOUNT_SETUP` link |
| exists without a password (walk-in, or setup not finished) | Email an `ACCOUNT_SETUP` link |
| exists with a password | Email a `portal-account-exists` notice with sign-in and reset links; no state change |

- **Following the link:** `/set-password?token=…` asks for a name (prefilled) and a password. Submitting it calls `setPortalAccountPassword()`, which:
  - stores the password hash;
  - sets `emailVerifiedAt`;
  - increments `authVersion`;
  - consumes the token;
  - issues a portal session;
  - redirects to the validated `returnTo`.
- **Why email-first:** if a password were collected before verification, someone could pre-register a victim's address with their own password. The victim's later "verify" click would then activate an account the attacker controls. With email-first, only the mailbox owner ever sets a password. As a consequence, **every account that has a password has a verified email**.
- **Input rules:** the same as today's sign-up schema. The name is required (trimmed, at least 1 character) and the password must be at least 8 characters. `/set-password` also asks the person to confirm the password.

### 7.3 Sign-in and sign-out

- **`/login`:** email and password, checked with bcrypt through `@vfurst/auth/core`.
  - Every failure renders one inline message: "Email or password is incorrect".
  - An unclaimed account cannot sign in. The page links to "Create account" and "Forgot password".
  - On success, any session token presented in the current cookie is revoked, and a new session is issued.
- **Sign-out:** a server action in the portal header revokes the `PortalSession` row and deletes the cookie.

### 7.4 Forgot password

- **Route:** `/forgot-password` collects an email and always answers "Check your email".
- **Branches:**
  - an account with a password gets a `PASSWORD_RESET` link to `/set-password`;
  - an unclaimed account gets an `ACCOUNT_SETUP` link;
  - an unknown email gets nothing.

### 7.5 Tokens

- 256-bit random value, base64url-encoded.
- Stored as SHA-256 hex.
- Single use, valid for 1 hour.
- Issuing a token consumes any older unconsumed token with the same account and purpose.
- Pages that carry a token send `Referrer-Policy: no-referrer` as an HTTP response header, plus the matching meta tag, and run no third-party script. The tenant branding images that the portal shell loads through CSS are allowed: the referrer policy keeps the token URL from reaching their hosts, and the token is single-use and expires in one hour. *(Amended 2026-10-14 during unit 1B.2: the original wording also banned third-party resources, but every token page inherits the portal shell's branding images.)*

### 7.6 Portal session

- **Cookie:** `__Host-vfurst-portal` with HttpOnly, Secure, SameSite=Lax, Path=/, and no `Domain` attribute.
  - Over plain HTTP the cookie is named `vfurst-portal` and is not Secure. This covers local development and the local production-mode E2E, which runs `next start` over HTTP.
  - The choice follows the request protocol (`x-forwarded-proto` behind the proxy), the same way Auth.js derives `useSecureCookies`. It does not depend on `NODE_ENV`.
- **Value:** a 256-bit random token. The database stores only its SHA-256.
- **Lifetime:** 30 days absolute.
- **Validity check on every request.** All of these must hold, otherwise the request is treated as anonymous:
  - the row exists;
  - `revokedAt` is null;
  - `expiresAt` is in the future;
  - `session.authVersion` equals the account's `authVersion`;
  - **`session.orgId` equals the organization resolved from the request host**.
- **Revocation:** setting or resetting a password increments `authVersion`, which ends every other session.

### 7.7 Code API

`apps/web/src/lib/portal-account.ts` exposes two functions:

- `getPortalAccount(org)`: memoized per request; returns `{ id, orgId, email, name } | null`.
- `requirePortalAccount(org, returnTo)`: redirects to the portal's `/login?returnTo=…` when there is no session.

They replace `requirePublicAccount()` and the direct `auth()` calls in the places listed below.

**Static pages and route handlers** *(amended 2026-10-15, unit 1B.3 plan)*:
- The ISR `/register` page cannot read cookies. Its account gate reads `GET /api/portal/session` instead. That endpoint is private and no-store, and returns only the signed-in account's email and name, following the ISR contract in `docs/plan/00-reference.md`.
- The middleware sets the tenant headers (`x-vfurst-org-host`, `x-vfurst-org-slug`, `x-vfurst-domain-mode`) on tenant-host `/api/*` requests too, without rewriting them. This lets portal route handlers resolve the organization from the host.

The call sites:

- the attendee actions: registration, cart, voucher, hotel, volunteer, vendor, transfer, account, and the Stripe checkout start;
- the portal pages;
- `/api/public/registration-confirmation`, which resolves the tenant from the `Host` header.

An action that operates on a stored resource also asserts `resource.orgId === account.orgId`. The composite foreign keys enforce the same rule underneath.

**Navigation after a server action on a tenant host** *(added 2026-10-14 during unit 1B.2)*:
- Never call `redirect()` to a relative path from a server action that runs on a tenant host. Next.js renders a server-action redirect target internally, without the middleware host rewrite, so `/login` resolves to the central route.
- Portal actions instead return a validated same-host `redirectTo`, and the client performs one full-document `window.location.replace`. This is the pattern the 2026-07-29 credentials-login fix already uses.
- Unit 1B.3 applies the same rule to every attendee action it moves to the portal host.

### 7.8 Portal account area

`{portal}/account` provides:

- overview;
- profile (name only);
- registrations and registration detail;
- orders and order detail;
- hotel bookings;
- volunteer and vendor applications;
- transfers;
- raffles.

The existing `app/account/*` pages move to `(convention)/[orgSlug]/account/*`, and their queries filter by `portalAccountId`. The central `/account` is deleted in 1B.3.

### 7.9 Related flows

- **Cashier walk-in:** `findOrCreatePortalAccount(tx, orgId, email, name)` replaces the creation of a password-less `User`. The person can claim the account later through `/signup`.
- **Transfers:** only within the tenant. The email to the recipient links to the canonical portal host. *(Amended 2026-10-15: the link goes straight to `{portal}/account/transfers/{id}?token=…`, and the central `/transfer/[requestId]` landing page is deleted with the central `/account`.)* Acceptance requires a signed-in portal account whose email equals `recipientEmail`. Because every account with a password has a verified email, this match is trustworthy.
- **Volunteer, vendor, raffle, and hotel records** belong to the `PortalAccount`. Staff-assignment emails go to `portalAccount.email`.

### 7.10 Organization lifecycle

- The existing lifecycle gate decides whether a portal renders at all.
- Where a portal renders, sign-in, password reset for accounts that have a password, and the account area stay available, so people can always see their records.
- While the organization is `SUSPENDED`, `/signup` and `ACCOUNT_SETUP` issuance count as new activity and are blocked.

### 7.11 Rate limits

- Sign-in, sign-up, and forgot-password reuse `assertAuthActionRateLimit`. Its quota is `VFURST_AUTH_RATE_LIMIT_PER_MINUTE` (default 30 per minute), and it **fails closed**.
- The namespaces are `portal-login`, `portal-signup`, and `portal-reset`. Each request is checked against two keys: `${orgId}:${ip}` and `${orgId}:${normalizedEmail}`.
- A request over the limit renders as inline form state. It never surfaces as a thrown error, following the Phase 1 rule for expected conditions.

## 8. Checkout, payments, email, API, worker, dashboard

### 8.1 Checkout

- **Location:** the checkout page and its payment-status poller move from `app/checkout/[orderId]` to `(convention)/[orgSlug]/checkout/[orderId]`. The central `/checkout` is deleted.
- **Unchanged:** the capability-token model (`checkoutTokenHash`, 30-minute TTL) and the single-active-attempt lock.
- **Host check:** the page and its actions reject, with not-found, any order whose `orgId` differs from the organization of the host.
- **Stripe URLs:** `success_url` and `cancel_url` are built from `getPortalOrigin(order.org)` instead of `NEXT_PUBLIC_APP_URL`. `customer_email` comes from the order's `PortalAccount`.
- **Return paths:** `checkoutSuccessPath` and `checkoutCancelPath` remain local paths validated by `requireSafeCheckoutReturnPath`. They are now interpreted relative to the portal host.
- **Unchanged as well:**
  - payment webhooks at `/api/webhooks/*`, which do not depend on the host;
  - the SePay QR and polling, which now simply run on the portal host;
  - Stripe Connect onboarding, which is a staff action on the central dashboard.

### 8.2 URL helpers

- New `apps/web/src/lib/portal-url.ts` with `getPortalOrigin(org)` and `getPortalUrl(org, path)`. It is aware of custom domains and built on the existing `buildTenantUrl` and host policy.
- `getCentralLoginUrl`, `getCentralRegistrationUrl`, and `getCentralPortalPath` are removed. The portal pages' "Account", "Log in", and "Create account" links become portal paths.
- *(Amended 2026-10-15)* `getConventionPortalRoot()` and `getConventionPortalRootForRequest()` are removed too. After the canonical-host redirects, a portal page always renders on its portal host, so the portal root is always `""`.
- *(Amended 2026-10-15)* The central sign-in, sign-up, and password-reset pages fall back to `/dashboard` instead of the deleted central `/account`, until 1B.4 replaces them.
- "Privacy" and "Powered by vFurst" keep pointing to the central host, and so do staff invitation links.

### 8.3 Email

- **New templates:** `portal-account-setup`, `portal-password-reset`, and `portal-account-exists`.
  - They are sent through the tenant's configured provider (`sendOrgEmail`) with tenant branding.
  - They are marked **not replayable**, and their payload is purged on a terminal state, matching today's password-reset semantics.
  - They are platform-protected: organizers cannot override them in this phase.
- **Changed template:** the registration-transfer email now says "your account on the {organization} portal" and links to the portal.
- **Unchanged:** the existing event-level override families. Any account link inside them now resolves through `getPortalUrl`.

### 8.4 Public API and webhooks

- **JSON field names do not change (D9).** `userId` in `/api/v1` responses and in webhook payloads carries the portal account ID. A tenant only ever sees its own accounts.
- `docs/api-contracts/openapi.yaml` and `webhooks.yaml` document the new meaning of `userId`.
- `/api/v1/attendees` reads `PortalAccount` rows of the API key's organization and keeps today's filtering semantics.
- The split-only auth contracts in `packages/contracts/src/auth.ts` are removed.

### 8.5 Worker

- Badge generation reads the name from `registration.portalAccount` (`name ?? email`). Phase 2 switches it to `AttendeeProfile`.
- The `identity-retention` changes are in §5.4.
- Email, reconciliation, expiry, and control-plane jobs are otherwise unchanged.

### 8.6 Dashboard and cashier

- Registration list and detail, check-in search, cashier, CSV exports, notes, raffle draws, and volunteer and vendor review read attendee identity from `portalAccount`.
- Searches are scoped to the organization. Export column shapes are unchanged.

## 9. Security requirements

Each requirement has at least one test (§12).

- **S1.** A `PortalAccount` can never satisfy a staff authorization check. It has no relation to `OrgMember` or `platformRole`, and the types do not convert into each other.
- **S2.** The composite foreign keys reject owner references that cross tenants.
- **S3.** A portal session is valid only for its own organization's host. The cookie is host-only, and the session's `orgId` is checked against the host on every request.
- **S4.** No vFurst cookie sets a `Domain` attribute. The staff cookie is host-only on the central host, and each portal cookie is host-only on its portal host. Portals and the central host share the registrable domain `reyuugames.com` and are therefore same-site; host-only cookies prevent crossing.
- **S5.** Portal and staff mutations run through Server Actions, whose Origin-equals-Host check rejects cross-subdomain forgery. Any route handler that mutates checks `Origin`.
- **S6.** Sign-up and forgot-password give identical responses in every account state, and every branch does comparable work by enqueuing at most one email.
- **S7.** Tokens follow §7.5.
- **S8.** Passwords use bcrypt from `@vfurst/auth/core`. Setting a password increments `authVersion`.
- **S9.** Back-channel logout validation follows §6.4.
- **S10.** OIDC uses PKCE and `state`, and the issuer is pinned by configuration. authentik tokens are not persisted, except the ID token kept for the logout hint, which is cleared on revocation.
- **S11.** `returnTo` accepts only local paths on both host types (`safeReturnTo`).
- **S12.** Checkout rejects orders that belong to a different host organization.
- **S13.** Portal pages never execute tenant-supplied script. This constraint carries forward to REG-P13 (Phase 2 unit 2.9).
- **S14.** Portal authentication rate limits fail closed. The back-channel endpoint follows the signed-webhook fail-open policy and logs degraded protection.

## 10. Split-runtime removal (unit 1B.1)

**Deleted:**

- `apps/platform-manager`, `apps/tenant-web`, `scripts/split/`, `scripts/run-split-e2e.mjs`, `playwright.split.config.mjs`.
- The split-only modules in `packages/auth` (`authorization-code`, `authorization-transaction`, `identity-assertion`, `tenant-session`) and their tests, once the import graph confirms that neither web nor worker uses them.
- The root scripts `predev:split`, `dev:split`, `build:split`, `test:split-topology`, and `test:e2e:split`, plus the split task entries in `turbo.json`.
- `docs/architecture/app-split-*.md`. Git history retains them.

**Kept:**

- `@vfurst/auth`: `core`, `invitations`, `public-account`, and `rate-limit`. `public-account` is adapted in 1B.3.
- `@vfurst/contracts`, minus the split auth contracts.
- `@vfurst/tenant-context`. Web uses it for host classification.
- The control-plane outbox.

**Recorded:**

- Audit Batch 6 (SPL defects) is **withdrawn**, because the split runtime was removed.
- AGENTS.md rule 8 is removed.
- The `test:split-topology` gate is removed from `verification.md` and `AGENTS.md`.

## 11. Environment and infrastructure

### 11.1 Environment variables

| Variable | Change | Notes |
|---|---|---|
| `AUTH_AUTHENTIK_ISSUER` | add | Local: `http://localhost:8090/vfurst` (mock). Deployed: the authentik application issuer URL. |
| `AUTH_AUTHENTIK_ID`, `AUTH_AUTHENTIK_SECRET` | add | Confidential client credentials. Runtime only. |
| `VFURST_PLATFORM_ADMIN_GROUP` | add | Default `vfurst-platform-admins`. |
| `VFURST_STAFF_SESSION_MAX_AGE_SECONDS` | add | Default `43200`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | remove | — |
| `NEXT_PUBLIC_ROOT_DOMAIN` | change (deployed) | `vfurst.reyuugames.com`. It is a build variable, so it must be set before the build. Local development keeps `localhost`. |

- New and removed keys go into `apps/web/.env.example` **and** the root `.env.local` / `.env.example`, so that `scripts/sync-app-env.mjs` carries them. `scripts/check-app-env.mjs` requires the authentik keys outside development.
- `scripts/manage-platform-admin.mjs` is deleted. Platform administrators are now managed through the authentik group.

### 11.2 Local stack

- `docker-compose.yml` adds a pinned `mock-oauth2-server` on port **8090** with issuer path `/vfurst`.
- AGENTS.md documents the port and the environment wiring.
- E2E and plain `npm run dev` both use it. Platform administrators are produced by putting the group in the mock's `groups` claim.

### 11.3 Runbook: `docs/launch/authentik-setup.md` (written in 1B.5)

The runbook covers these authentik settings:

- **OAuth2/OpenID provider:**
  - confidential client;
  - strict redirect URI `https://vfurst.reyuugames.com/api/auth/callback/authentik`;
  - signing key with RS256.
- **Subject mode:** hashed user ID or UUID. It must be immutable, never email or username, because changing it later would orphan staff users.
- **Scopes:**
  - `openid`, `email`, `profile`; `profile` includes `groups`, which the runbook verifies.
  - The default `email` mapping is replaced with one that emits the true verification state, following authentik's "verify email address" guide.
  - An email stage is added to the enrollment flow.
- **Invalidation flow:** a dedicated flow for this provider that contains a User Logout stage.
- **Logout:** Logout URI `https://vfurst.reyuugames.com/api/oidc/backchannel-logout`, method Back-channel.
- **Group:** `vfurst-platform-admins`.
- **Application:** "vFurst", with launch URL on the central host, and no policy bindings. Invitees must be able to sign in before they have any membership.
- **Smoke checklist:** sign in, admin group mapping, invitation with a verified email, logout ending the authentik session, and back-channel revocation when a test user is deactivated.

### 11.4 DNS and TLS (deployed environment)

- Wildcard DNS `*.vfurst.reyuugames.com` pointing at the vFurst origin.
- A wildcard certificate for that second-level name. Cloudflare Universal SSL does not cover it, so the certificate comes from Cloudflare Advanced Certificate Manager or from a Let's Encrypt DNS-01 certificate issued through Coolify/Traefik. The runbook in `docs/launch/staging-coolify-setup.md` records which one is used.
- Reserved platform subdomains stay as they are (`api`, `app`, `console`, `manager`, `www`). With the root domain set to `vfurst.reyuugames.com`, tenant hosts cannot collide with `account.reyuugames.com`.

## 12. Testing

**Unit (Vitest):**

- Staff:
  - claim synchronization: groups → role, `emailVerified` mirroring, email-conflict denial;
  - the adapter wrapper does not persist tokens;
  - logout-token validation, covering each rejection rule in §6.4 with a local JWKS;
  - revocation by `sid` and by `sub`;
  - invitation `EMAIL_UNVERIFIED`.
- Portal:
  - branch selection for setup and reset, including identical responses;
  - token issue, consume, expiry, and supersede;
  - the password invariant;
  - session validation: wrong organization, revoked, expired, `authVersion` mismatch;
  - cookie attributes in production and development modes;
  - canonical host and redirect computation, including custom domains;
  - rate-limit keys.

**Database tests (`packages/db`):**

- Composite foreign keys reject a registration, order, or session that points at another tenant's account.
- Deleting an organization still cascades (DAT-01).

**E2E (Playwright), with helpers:**

- `loginAsStaff(page, { sub, email, emailVerified, groups })`, which drives the mock OIDC login form.
- `loginAsAttendee(page, org, email)`, which uses fixture accounts that already have a password.

**New E2E specs:**

- The full email-first setup, reading the link from Mailpit.
- Sign-in, sign-out, and forgot password.
- Walk-in claim, including the account-exists notice and enumeration-safe responses.
- The same email at two tenants as two independent accounts.
- A portal cookie being invalid on another tenant.
- Central-path to tenant-host redirects.
- Checkout on the portal host, including rejection of another tenant's order.
- Staff platform-admin and member routing.
- Invitation acceptance with and without a verified email.
- Staff logout.

**Existing suite:**

- All 118 specs migrate to the new helpers and run against `{slug}.localhost:3000`.
- Visual and axe baselines are updated only for pages whose markup changed.

**Load:** the 500/50 k6 proof is re-run in 1B.5, because the registration path changed (portal session lookup). The k6 scripts sign in through portal accounts.

**Phase gates:**

- Every unit runs the standard session gates and the host probe.
- Phase 1B completes when all of the following pass:
  - the full production E2E suite;
  - `npm run check:launch` with its known external failures only;
  - `npm audit --audit-level=moderate`;
  - the k6 proof;
  - the updated manual walkthrough (§14);
  - the deployed smoke test (§11.3).

## 13. Delivery plan

Each unit is one session (1B.3 may take two) and ends with green gates on `feat/identity-replatform`.

| Unit | Scope | System state afterwards |
|---|---|---|
| **1B.1** | Record decisions in the plan documents (§14). Remove the split runtime (§10), including the `AuthorizationCode` model (§5.4). | Behavior unchanged |
| **1B.2** | Portal identity foundation, additive only: the three new models, session and token libraries, portal `/login`, `/signup`, `/forgot-password`, `/set-password`, sign-out, the three email templates, rate limits, retention, and unit and E2E coverage of portal authentication. | Portal authentication works; no business flow uses it yet |
| **1B.3** | Attendee domain on `PortalAccount`: the §5.3 renames and composite foreign keys, `requirePortalAccount` everywhere, the portal account area, portal checkout, canonical-host redirects, transfers, walk-in, API, worker, dashboard reads, and deletion of central `/account` and `/checkout`. Attendee E2E migrates. | Attendees use the portal; staff still use the current credentials sign-in |
| **1B.4** | Staff SSO: the authentik provider and the mock OIDC, claim synchronization, the 12-hour sessions, back-channel logout, single logout, invitations; removal of `passwordHash`, `avatar`, the `Credentials`/`Google` providers, central `/register`, `/forgot-password`, `/reset-password`, the 1B.4 models in §5.4, and `manage-platform-admin.mjs`. Staff E2E migrates. | Each audience has exactly one identity system |
| **1B.5** | Closeout: full production E2E, visual and axe baselines, the k6 proof, the authentik and DNS/TLS runbooks, the OpenAPI/webhooks and `apps/docs` updates. Merge to `staging`, apply the deployed environment variables, reset the deployed database, deploy, run the smoke test, and record the evidence. | Ready for Phase 2 |

**Why the portal comes before staff:** each intermediate state uses one coherent identity system per audience, so no temporary hybrid code has to be written and later deleted.

**Merging once:** the deployed `prestart` runs `prisma db push` without a data-loss flag. The destructive steps in 1B.3 and 1B.4 would therefore fail a deployment if merged piecemeal. The deployed database reset happens once, deliberately, in 1B.5.

## 14. Documentation updates

**In 1B.1:**

- `00-reference.md`: the superseded decisions (§2), the product and access model, the role matrix wording, the surfaces, the tech stack, the email contract (portal authentication emails), and the project structure (split removed).
- New `docs/plan/phase-1b-identity.md`: the unit table from §13, linking this spec.
- `phase-2-attendee-parity.md`: the decisions in §2.
- `02-concat-parity.md`: notes on REG-P9 scope and transfer scope.
- `verification.md`:
  - a Phase 1B checkpoint row;
  - the manual walkthrough rewritten for portal sign-up, sign-in, and account, staff sign-in through the mock, and the central-path redirect;
  - the tenant gates gain "a portal account can never gain membership".
- `runtime-defect-audit-2026-07-26.md`: Batch 6 withdrawn.
- `AGENTS.md`: reading rule, commands, ports, environment table, rule 8 removed.
- `PROGRESS.md`: current phase set to 1B.

**In 1B.5:**

- `docs/launch/authentik-setup.md`.
- `staging-coolify-setup.md`: environment variables, DNS, TLS, database reset.
- `go-live-checklist.md`.
- `docs/api-contracts/*`.
- `apps/docs` account and sign-in pages.
- `01-current-state.md`.

## 15. Risks and verification items

| # | Risk | Mitigation / where it is verified |
|---|---|---|
| R1 | Auth.js may refuse an `http://` issuer (the mock) when `NODE_ENV=production`, which would break production-mode E2E | First task of 1B.4. Fallback: serve the mock over HTTPS with a self-signed certificate trusted through `NODE_EXTRA_CA_CERTS` |
| R2 | Back-channel logout is Preview in authentik 2025.10 | The 12-hour cap is the guarantee. The deployed smoke test checks revocation on deactivation |
| R3 | authentik may omit `sid` | Fall back to `sub`-wide revocation through `authVersion` (§6.4) |
| R4 | authentik may ignore `post_logout_redirect_uri` | The local logout has already happened, and the person lands on authentik's signed-out page. Acceptable; recorded in the runbook |
| R5 | `email_verified` is false by default | Runbook configuration. Invitations fail closed with `EMAIL_UNVERIFIED` |
| R6 | A Prisma composite foreign key that shares `orgId` with `NoAction` may be rejected or behave unexpectedly | First step of 1B.3: `prisma validate`, a database test, and the DAT-01 regression |
| R7 | The wildcard certificate for the second-level subdomain is not provisioned | Blocks only the 1B.5 deployment, not development. Runbook item |
| R8 | The Server Actions Origin check behind Cloudflare/Coolify on tenant hosts (forwarded host headers) | Deployed smoke test in 1B.5 |
| R9 | The per-request portal session lookup adds latency | Unique `tokenHash` index. k6 proof in 1B.5 |
| R10 | The authentik subject mode changes after go-live | The runbook mandates an immutable subject mode (§11.3) |
