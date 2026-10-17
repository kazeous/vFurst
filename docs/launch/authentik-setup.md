# Staff sign-in with the studio authentik

Staff and operators (anyone using `/dashboard` or `/platform`) sign in to vFurst only
through the studio identity provider at `account.reyuugames.com`, which runs
authentik **2025.10.3**. vFurst stores no staff password. Attendees, volunteers, and
vendors never use authentik; they have accounts on each event portal.

Design: `docs/superpowers/specs/2026-10-13-identity-replatform-design.md` §6 and §11.3.
Local development and E2E use the `mock-oidc` service instead (see `AGENTS.md`).

## Values used below

| Item | Value |
|---|---|
| Application slug | `vfurst` |
| Issuer (`AUTH_AUTHENTIK_ISSUER`) | `https://account.reyuugames.com/application/o/vfurst/` |
| Redirect URI (strict) | `https://vfurst.reyuugames.com/api/auth/callback/authentik` |
| Back-channel logout URI | `https://vfurst.reyuugames.com/api/oidc/backchannel-logout` |
| Post-logout redirect | `https://vfurst.reyuugames.com/` |
| Platform admin group (`VFURST_PLATFORM_ADMIN_GROUP`) | `vfurst-platform-admins` |

## 1. OAuth2/OpenID provider

In the authentik admin interface, create an **OAuth2/OpenID Provider**:

1. **Name:** `vFurst`. **Client type:** Confidential.
2. **Authorization flow:** `default-provider-authorization-implicit-consent`. vFurst is a
   first-party studio application, so a consent screen adds a click without protecting
   anything. Never reuse another application's flow (such as Pawket's): its stages and
   policies would apply to vFurst too.
3. **Redirect URIs/Origins:** mode *Strict*, value `https://vfurst.reyuugames.com/api/auth/callback/authentik`.
4. **Signing key:** an RS256 certificate (the default self-signed certificate is fine).
5. **Subject mode:** *Based on the User's hashed ID* or *Based on the User's UUID*.
   **Never** email or username, and **never change it after go-live**: vFurst links
   each staff user to the `sub` claim, and a new subject mode orphans every staff
   account (an email that already exists then hits the `StudioAccountConflict` rule).
6. **Scopes:** `openid`, `email`, `profile`. authentik's default `profile` scope
   carries `groups`; confirm it in the scope mapping's preview.
7. **Email verification:** authentik's default `email` mapping always sends
   `email_verified: false`. Replace it with a mapping that emits the user's real
   verification state, following authentik's "verify email address" guide, and add
   an **email stage** to the enrollment flow so new accounts verify their address.
   Until this is done, invitation acceptance fails closed with `EMAIL_UNVERIFIED`.
8. **Invalidation flow:** create a dedicated flow for this provider that contains a
   **User Logout** stage, and select it as the provider's invalidation flow. Signing
   out of vFurst then ends the authentik session without changing the studio's
   default flow for other applications.
9. **Logout:** Logout URI `https://vfurst.reyuugames.com/api/oidc/backchannel-logout`,
   method **Back-channel**.

Read the **Client ID** and **Client Secret** from the provider page. They go into the
Coolify environment as `AUTH_AUTHENTIK_ID` and `AUTH_AUTHENTIK_SECRET` (runtime only,
never "Available at Buildtime"); see `docs/launch/staging-coolify-setup.md` §3.

## 2. Group

Create the group `vfurst-platform-admins` and add the people who operate `/platform`.
vFurst re-reads the group at every sign-in: removing someone takes effect at their
next sign-in, and their live session loses platform access on the next request after
that sign-in. Review the membership before launch.

## 3. Application

Create an **Application** named "vFurst", slug `vfurst`, using the provider above.
Launch URL: `https://vfurst.reyuugames.com/login`. Add **no policy bindings**: an
invitee must be able to sign in before they have any vFurst membership, and vFurst
decides what each staff account may do.

## 4. Known behaviors

- **Back-channel logout is Preview** in authentik 2025.10. The 12-hour staff session
  cap (`VFURST_STAFF_SESSION_MAX_AGE_SECONDS`, default 43200) is the guarantee;
  back-channel revocation is an improvement on top of it.
- authentik may omit `sid` from tokens. vFurst then revokes every session of that
  subject by bumping its `authVersion`.
- authentik may ignore `post_logout_redirect_uri`. The local vFurst logout has already
  happened, and the person lands on authentik's signed-out page. Acceptable.

## 5. Smoke checklist (deployed)

Run after the deployment in `docs/launch/staging-coolify-setup.md` §6:

1. An account in `vfurst-platform-admins` signs in at `/login` and lands on `/platform`.
2. An account outside the group signs in and sees the "Organizer access required" screen.
3. The admin invites the second account to an organization. With the email unverified
   in authentik, the invitation shows `EMAIL_UNVERIFIED`; after verifying it, the
   invitation is accepted.
4. Logging out of vFurst passes through authentik's end-session page and ends the
   authentik session (the next `/login` asks for credentials again).
5. Deactivating a signed-in test user in authentik signs that browser out of vFurst
   within about a minute (back-channel). If it does not, record it; see §4.
