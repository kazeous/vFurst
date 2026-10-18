# Staff SSO hardening (2026-10-19)

The owner approved using Pawket's privileged-session policy for vFurst staff on
2026-10-19. This is one corrective identity unit; Phase 2 is unchanged. Attendee,
volunteer and vendor portal accounts keep their independent identity system.

## Review outcome

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
from tenant hosts. Staff session cookies use `__Host-vfurst-staff` on HTTPS and
staff routes canonicalize platform aliases before those cookies are issued.
Sentry scrubs nested invitation/token return URLs and removes bearer headers,
cookies and authentication POST payloads.

Added policy:

- A 5-minute IdP lease. Stale leases cannot authorize staff work. `/login` offers
  an explicit `prompt=none` check of the original subject and session.
- 30-minute idle and at most 12-hour absolute lifetime (the existing environment
  override may shorten the absolute cap). A lease or step-up preserves both
  deadlines; ordinary activity touches idle expiry at most once per minute.
- Platform mutations, org settings/membership/Stripe changes and refunds need
  a verified email plus primary and second-factor evidence under 60 minutes old.
  Step-up uses `prompt=login` and `max_age=10` and rejects old `auth_time`, missing
  MFA, account changes and revoked sessions.
- `/staff/sessions` lists only the current user's sessions, supports ending
  another session and logging out all vFurst sessions. Logout happens locally
  before the provider is contacted.
- Structured forms keep entries and open verification in another tab. The user
  explicitly submits again afterwards; no sensitive command is replayed.

## Configure the existing authentik provider before deploying the web change

1. Export the current **vFurst provider** settings for rollback. Keep the existing
   immutable issuer, client ID, subject mode, group mapping and membership rows.
   This is additive schema synchronization; do not reset the database.
2. Import `vfurst-flows-v1.yaml` into authentik 2025.10.3. It creates only dedicated
   vFurst flows/stages/mappings. It does not edit the shared Brand, Pawket, default
   flows, users, groups or application bindings. Configure SMTP on the dedicated
   email stage or use the existing global SMTP configuration.
3. On the vFurst OAuth2 provider, select `vfurst-authentication-v1` as its
   authentication flow and `vfurst-authorization-v1` as its authorization flow.
   Keep the existing invalidation flow and exact callback and post-logout URLs.
4. Enable **Include claims in id_token**. Keep `openid` and the profile mapping
   that supplies `groups`. Replace the old attribute-backed `email` mapping
   with `vfurst-email-evidence-v1`, and add `vfurst-assurance-v1` (scope
   `vfurst_assurance`). Do not select two mappings for the same email claim.
   Evidence comes from the actual login event and confirmed TOTP/WebAuthn
   devices; editable user attributes never assert MFA or email verification.
5. Use an RS256 signing key, preferably the already proven RSA-2048 studio key.
   Keep client authentication confidential; vFurst uses `client_secret_post`.
   This avoids authentik 2025.10's HTTP Basic form-decoding issue, as on Pawket.
6. Confirm the provider's back-channel logout URI is
   `https://vfurst.reyuugames.com/api/oidc/backchannel-logout` and the selected
   logout method is back-channel. Provider logout behavior determines whether
   the shared studio session is also ended; preserve the owner's chosen SLO
   behavior. See [authentik logout documentation](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/frontchannel_and_backchannel_logout/).
7. Verify an ordinary login, password + TOTP and password + WebAuthn step-up on
   this provider **before** deploying. A provider preview is insufficient:
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
