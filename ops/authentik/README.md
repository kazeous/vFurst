# Staff SSO hardening (2026-10-19)

The owner approved using Pawket's privileged-session policy for vFurst staff on
2026-10-19. This is one corrective identity unit; Phase 2 is unchanged. Attendee,
volunteer and vendor portal accounts keep their independent identity system.

## Review outcome

Initial read-only deployed-provider probe, **2026-10-19 (Asia/Saigon), before the
owner authorized the Chrome rollout**:

- [vFurst discovery](https://account.reyuugames.com/application/o/vfurst/.well-known/openid-configuration)
  reports only `HS256`, with scopes `openid profile email`. `client_secret_post`,
  PKCE S256 and back-channel support are advertised; `vfurst_assurance` is absent.
- [vFurst JWKS](https://account.reyuugames.com/application/o/vfurst/jwks/)
  returns HTTP 200 with `{}`, containing no `keys` array. The old receiver uses
  `createRemoteJWKSet`, so this cannot verify its logout tokens. This is a concrete
  configuration defect, beyond the earlier unobserved Preview/deactivation smoke.
- That initial probe sent no credentials and changed no provider setting.
  The subsequent authorized configuration and live acceptance are recorded in
  `rollout-2026-10-19.md`; its public discovery now advertises RS256 and assurance.

The existing integration had a session-resurrection defect: rejecting a JWT
removed its registry ID, Auth.js re-encoded it, and the legacy upgrade path could
issue another session on the next read. Revocation and the 12-hour cap therefore
did not reliably hold across repeated session reads. The upgrade path is removed;
rejected JWTs are cleared. Only a consumed browser-bound OIDC transaction can
issue a staff session.

Other corrections: synchronized profile fields now reach the session and the
invitation page reads the current database email; subject-wide revocation clears
logout hints; logout receipts commit with revocation; late callbacks are fenced;
discovery, JWKS and logout URLs stay on the configured origin; signatures are
pinned to RS256, with state, nonce and PKCE; staff APIs and cookies are isolated
from tenant hosts. Staff session cookies use `__Host-vfurst-staff` on HTTPS;
state, nonce, PKCE, CSRF and callback cookies also use `__Host-` names, and
staff routes canonicalize platform aliases before those cookies are issued.
The browser-intent cookie uses `__Host-vfurst-oidc-flow` (plain `vfurst-oidc-flow`
on HTTP loopback). Its name must never start with the session cookie's name:
Auth.js joins every matching prefix as a JWT chunk, which otherwise corrupts
session reads and clears an in-flight MFA intent in another tab.
Sentry scrubs nested invitation/token return URLs and removes bearer headers,
cookies and authentication POST payloads. Its browser Replay/telemetry exclusion
also covers invitation links and login/verification pages carrying those links;
client errors and transactions use the same scrubber as server and edge events.

Added policy:

- A 5-minute IdP lease. Stale leases cannot authorize staff work. `/login` offers
  an explicit `prompt=none` check of the original subject and session.
- 30-minute idle and at most 12-hour absolute lifetime (the existing environment
  override may shorten the absolute cap). A lease or step-up preserves both
  deadlines; ordinary activity touches idle expiry at most once per minute.
  A lease keeps its session ID; fresh step-up replaces it and leaves the old
  row revoked. This accommodates the observed authentik old-sid logout during
  fresh authentication without restoring the old JWT's authority.
- Platform operations and owner/admin-only org/event/resource mutations and
  sensitive exports, including settings, membership, Stripe and refunds, need
  a verified email plus primary and second-factor evidence under 60 minutes old.
  Step-up uses `prompt=login` and `max_age=10` and rejects old `auth_time`, missing
  MFA and account changes. An already-revoked origin is eligible only when a
  verified old-sid revocation occurred during this intent, the new sid differs,
  and fresh primary/MFA proof succeeds. Local logout, explicit session revocation,
  new-sid/subject revocation and expired lifetimes still reject the callback.
- Member-level event-day capabilities retain their existing membership checks
  and the 5-minute IdP lease; ordinary workspace pages do not force MFA step-up.
- `/staff/sessions` lists only the current user's sessions, supports ending
  another session and logging out all vFurst sessions. Logout happens locally
  before the provider is contacted.
  Logout atomically consumes the browser's pending flow even if IdP logout has
  already invalidated its JWT. Completion records the issued binding on that
  same flow, so logout also revokes the replacement if completion won the race.
- Structured forms keep entries and open verification in another tab. The user
  explicitly submits again afterwards; no sensitive command is replayed.

## Configure the existing authentik provider before deploying the web change

1. Export the current **vFurst provider** settings for rollback. Keep its identity,
   client ID, subject mode, group mapping and membership rows. Configure the exact
   discovery issuer `https://account.reyuugames.com/application/o/vfurst/`, including
   its trailing slash; do not repoint existing accounts to a different issuer.
   This is additive schema synchronization; do not reset the database.
2. Import `vfurst-flows-v1.yaml` into authentik (live server: **2026.8.4**). It creates only dedicated
   vFurst flows/stages/mappings. It does not edit the shared Brand, Pawket, default
   flows, users, groups or application bindings. The dedicated email stage uses
   the existing global SMTP transport, matching the old vFurst verification stage;
   no SMTP credentials are embedded. A new stage otherwise defaults to localhost:25.
3. On the vFurst OAuth2 provider, select `vfurst-authentication-v1` as its
   authentication flow and `vfurst-authorization-v1` as its authorization flow.
   Select `vfurst-invalidation-v1` as its invalidation flow. Keep the exact callback
   URL and add the strict post-logout redirect `https://vfurst.reyuugames.com/`.
   Permit only the authorization-code grant; the app does not use implicit,
   hybrid, refresh, client-credentials, password, device-code or token-exchange grants.
4. Enable **Include claims in id_token**. Keep `openid` and the profile mapping
   that supplies `groups`. Replace the old attribute-backed `email` mapping
   with `vfurst-email-evidence-v1`, and add `vfurst-assurance-v1` (scope
   `vfurst_assurance`). Do not select two mappings for the same email claim.
   Evidence comes from the actual login event and confirmed TOTP/WebAuthn
   devices; editable user attributes never assert MFA or email verification.
5. Set an **RS256 signing key**; the current HS256-only configuration must change.
   Select an existing RSA-2048 studio signing key, or generate a dedicated key in
   the authentik server container without printing its private material:

   ```sh
   ak shell -c "from authentik.crypto.builder import CertificateBuilder; from cryptography.hazmat.primitives.asymmetric import rsa; b=CertificateBuilder('vfurst-oidc-signing-rsa2048-v1'); b.generate_private_key=lambda: rsa.generate_private_key(public_exponent=65537, key_size=2048); b.build(validity_days=3650); c=b.save(); print('created', c.name, 'bits', c.private_key.key_size)"
   ```

   Generate it once, select it on the vFurst provider, and confirm discovery
   advertises RS256 and JWKS has a public RSA-2048 key. No private key goes in Git.
   Keep client authentication confidential; vFurst uses `client_secret_post`.
   This avoids authentik 2025.10's HTTP Basic form-decoding issue, as on Pawket.
6. Confirm the provider's back-channel logout URI is
   `https://vfurst.reyuugames.com/api/oidc/backchannel-logout` and the selected
   logout method is back-channel. Provider logout behavior determines whether
   the shared studio session is also ended. The standing vFurst contract ends
   that session too: select the dedicated `vfurst-invalidation-v1` flow, whose
   User Logout stage ends the studio session, without
   editing Pawket or the shared defaults. Verify a vFurst logout really ends the
   studio session instead of immediately reusing it on the next sign-in.
   See [authentik logout documentation](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/frontchannel_and_backchannel_logout/).
7. Verify an ordinary real signed callback and email delivery before the staging
   deployment. The old web release requests only three scopes and cannot inspect
   the new assurance contract. After CI passes, use the controlled staging
   deployment to verify password + TOTP and password + WebAuthn and real step-up
   through the new callback. **Do not mark rollout accepted until these pass.**
   A provider preview is insufficient:
   verify real signed ID-token claims, `auth_time`, the `amr` MFA marker, the
   `vfurst_assurance` version 1 / policy `vfurst-v1`, and verified email. Never
   paste tokens or credentials into logs or progress notes. Passwordless passkey
   primary login remains unsupported, matching Pawket's evidence contract.
8. Deploy web and worker together through the normal non-destructive `prestart`
   schema sync. Existing staff sessions require a fresh sign-in because their
   old cookie/evidence is no longer accepted. Portal sessions remain independent.

The blueprint's email proof is an event tied to the user UUID and exact email.
It replaces the old `email_verified` user flag for this provider. Its authorization
flow sends verification automatically when necessary; the invitation's retry
starts that OIDC flow. The old standalone email flow can be retained during
rollout, but its flag does not satisfy the new mapping.

## Deployed acceptance

Record the exact revision and separate deployed results from local/mock results.
Check admin/owner/outsider routing, original-subject lease renewal, expired lease
and IdP outage, 60-minute action step-up with both MFA types, form retention,
single/all-session logout, a late callback after logout, and actual authentik
session revocation/deactivation. Verify two tenant hosts cannot access staff auth
APIs or receive staff cookies, and the same portal email still means two accounts.
The earlier unobserved authentik back-channel deactivation smoke remains open
until a real provider request and subsequent staff-access denial are observed.

If the provider cannot issue the assurance contract, keep the existing deployed
web release until it can; the new release intentionally has no claim bypass.
No real IdP change, push, merge or deployment is implied by local test success.

The Chrome-authorized live rollout is recorded in `rollout-2026-10-19.md`.
`vfurst-provider-live-v1.yaml` targets **provider 4 / vFurst on the existing
studio host only**, after applying the flows blueprint. It applies the public
settings without changing the client ID, secret, subject mode or memberships.
Do not apply that host-specific file to another environment. The 2026.8.4 edit
form rejected redirect URI changes with HTTP 400; the official blueprint engine
applied the same strict URI contract successfully.
