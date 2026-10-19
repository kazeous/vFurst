"""Run with `ak shell -c` after installing the persistent branding files.

Only presentation fields change. No provider, flow binding, authentication,
session, user or group configuration is changed. Safe to re-run after upgrades.
"""

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from django.db import transaction

from authentik.brands.models import Brand
from authentik.flows.models import Flow
from authentik.events.models import NotificationTransport
from authentik.stages.authenticator_totp.models import AuthenticatorTOTPStage
from authentik.stages.email.models import EmailStage

ROOT = Path('/templates/reyuugames')
TITLE = 'reyuuGAMES Account'
FLOW_TITLES = {
    'default-authentication-flow': 'Sign in',
    'default-source-authentication': 'Sign in',
    'default-source-enrollment': 'Choose a username',
    'initial-setup': 'Initial setup',
}


def apply():
    brands = list(Brand.objects.all())
    assert len(brands) == 1 and brands[0].default, 'Review brand matching before applying'
    for name in ('account_confirmation.html', 'password_reset.html'):
        assert (ROOT / name).is_file(), f'Missing studio template: {name}'
    css = (ROOT / 'brand.css').read_text()
    brand = brands[0]
    # Save only public presentation values, never SMTP/provider credentials.
    snapshot = {
        'brand': {'pk': str(brand.pk), 'branding_title': brand.branding_title,
                  'branding_custom_css': brand.branding_custom_css},
        'flows': list(Flow.objects.filter(slug__in=FLOW_TITLES).values('slug', 'title')),
        'email': list(EmailStage.objects.filter(name='vfurst-email-verification-v1')
                      .values('name', 'template')),
        'notifications': list(NotificationTransport.objects.filter(mode='email')
                              .values('name', 'email_subject_prefix')),
        'totp': list(AuthenticatorTOTPStage.objects.values('name', 'friendly_name')),
    }
    backup = Path('/data/reyuugames-branding-backups')
    backup.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    (backup / f'{stamp}.json').write_text(json.dumps(snapshot, indent=2))
    with transaction.atomic():
        # Preserve any unrelated custom rules. Add the current light-DOM rule
        # once, without replacing an operator's other CSS.
        existing = re.sub(
            r'/\* 2026\.8 renders BrandLinks[^*]*\*/\s*ak-brand-links[^}]*\}\s*',
            '', brand.branding_custom_css, count=1,
        )
        if css.strip() not in existing:
            brand.branding_custom_css = existing.rstrip() + '\n\n' + css
        brand.branding_title = TITLE
        brand.save(update_fields=['branding_title', 'branding_custom_css'])
        changed = []
        for slug, title in FLOW_TITLES.items():
            flow = Flow.objects.filter(slug=slug).first()
            if flow and 'authentik' in flow.title.lower():
                flow.title = title
                flow.save(update_fields=['title'])
                changed.append(slug)
        emails = EmailStage.objects.filter(name='vfurst-email-verification-v1')
        assert emails.count() == 1, 'Expected existing vFurst verification stage'
        emails.update(template='reyuugames/account_confirmation.html')
        for transport in NotificationTransport.objects.filter(mode='email'):
            if 'authentik' in transport.email_subject_prefix.lower():
                transport.email_subject_prefix = TITLE + ': '
                transport.save(update_fields=['email_subject_prefix'])
        for stage in AuthenticatorTOTPStage.objects.all():
            if 'authentik' in stage.friendly_name.lower():
                stage.friendly_name = TITLE
                stage.save(update_fields=['friendly_name'])
    print('BRANDING_APPLIED ' + json.dumps({'title': brand.branding_title,
          'flow_titles_changed': changed, 'email_template': 'reyuugames/account_confirmation.html',
          'backup': str(backup / f'{stamp}.json')}))


apply()
