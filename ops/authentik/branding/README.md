# reyuuGAMES Account presentation (2026.8.4)

The shared Account service uses this persistent bundle. It supersedes Pawket's
2025.10 branding selectors and fixes the dedicated vFurst stage's accidental
selection of the stock email template. No identity/security contracts change.

## Persistent installation

The existing Coolify service has shared `./custom-templates:/templates` and
`./media:/data/media` on **both** server and worker. Copy `templates/` into
`/templates`, `assets/` into `/data/media/public/reyuugames`, and `apply.py`,
`verify.py` and `brand.css` into `/templates/reyuugames/`. The root worker can write this existing
volume; the unprivileged server reads files with mode 0644.

`install.py` accepts a JSON map of relative filenames to base64 bytes on stdin.
It limits destinations to these directories and backs up overwritten files and
an existence manifest under `/data/reyuugames-branding-backups/`.

Add these bind mounts to server and worker, preserving their existing mounts:

```yaml
- './media/public/reyuugames:/web/dist/assets/reyuugames:ro'
- './media/public/reyuugames/startup.html:/web/dist/standalone/loading/startup.html:ro'
```

The static directory contains **public branding files only**, never credentials,
reports or account uploads. Do not expose all of `/data` or `/media`. New signed
`/files/media/` links expire; the old `/media/public/` route returns 404 in 2026.8.
Emails therefore use the deliberately public, stable `/static/dist/assets/reyuugames/`
logo URL. No expiring storage token is embedded in an email.

Run on the worker, then restart the service so both Django processes reload
templates and the new mounts become active:

```sh
AUTHENTIK_LOG_LEVEL=error ak shell -c 'exec(open("/templates/reyuugames/apply.py").read())'
```

The script backs up public presentation fields, changes only stock vendor flow
titles, the Brand title/CSS, the existing vFurst email template, notification
subject prefixes and a stock TOTP issuer label. It preserves other CSS, logo,
favicon, flow/stage bindings, policies, SMTP settings and all credentials. Existing
authenticator entries retain the issuer label stored at enrollment.

## Coverage and verification

- Light and shadow DOM flow footer credit; configured support/legal links stay.
- Default/source sign-in and initial setup headings, document title and favicon.
- Flow logo's accessible alt label, including theme/rerender changes.
- Static login/error-page logo alt and footer, independent of JavaScript/CSS.
- Dedicated and stock confirmation/reset email paths, both HTML and plain text.
- Stock email base for OTP/invitation/notification email, and setup/test email.
- Startup HTML mounted over the upstream splash; automatic retry remains.
- A browser-document router replaces 5xx bodies with the branded unavailable
  page, retaining the original status, omitting the original request URL and
  setting `Cache-Control: no-store`. API/static paths and non-HTML clients keep
  their original responses. HTTPS, certificate resolver and backend port match
  the existing Coolify router. No existing router is removed or relaxed.

Add `proxyLabels` from `proxy-config.mjs` to **only the server** Compose service's
labels. This live service uses Traefik v3.7. Run the isolated integration proof
before changing these labels:

```sh
node ops/authentik/branding/proxy.test.mjs
```

It starts two disposable containers on a dedicated Docker network, exposes only
loopback port 3189, mounts no Docker socket and removes its containers/network.
It verifies branded HTML 502, original status, no-store, omitted request query,
preserved normal/security headers and unchanged API/JSON/static/200/404 responses.

Render mail with `TemplateEmailMessage` in server **and** worker using synthetic
context and an inert URL. Verify button/fallback URL, escaping, expiry, plain-text
part, logo, sender and absence of vendor names. Never print real mail/event bodies,
verification links, OIDC parameters, storage tokens or SMTP settings. Verify
public flow pages and an actual generic error page in Chrome; save screenshots.
Ordinary vFurst authentication/MFA and authorization behavior are unchanged.

The user account UI already uses the Brand title/logo/favicons, including logo
alt text. Admin-only diagnostics, protocol routes, cookie/storage identifiers,
API schemas and source copyright are upstream implementation details; this bundle
does not rewrite them. Raw API diagnostics remain available to technical clients.

## Upgrade and rollback

Keep these Compose mounts across upgrades. Re-run the presentation script after
upgrading: upstream default blueprints can reset default flow titles. Verify the
footer's DOM structure, inherited `if/flow.html` head block, static login base,
startup-file path, public PNG response and email render on the **new** version.
This is a version-tested overlay, not a promise about future upstream markup.

For rollback, restore files according to the saved existence manifest and restore
the presentation fields from the timestamped JSON snapshot. Remove the two added
mounts and restart only if returning to the previous deployment layout. Never
restore an entire user/provider database or reset accounts for a branding rollback.

`email/base.html` and `login/base_full.html` adapt MIT-licensed upstream templates
from tag `version/2026.8.4`; see `UPSTREAM-LICENSE`. The named Account email templates
and PNGs reuse the studio's existing Pawket branding assets.
