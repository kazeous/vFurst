"""Read-only integration checks against the installed Django template engine.

Run in server and worker with `ak shell -c`. It never sends mail or creates
tokens/users/sessions. All message context is synthetic; output excludes links.
"""
import base64
import json
import zlib
from datetime import timedelta
from html.parser import HTMLParser
from types import SimpleNamespace

from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.template.loader import get_template, render_to_string
from django.test import RequestFactory
from django.utils.timezone import now

from authentik.brands.models import Brand
from authentik.stages.email.utils import TemplateEmailMessage


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []
        self.images = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a':
            self.hrefs.append(attrs.get('href'))
        if tag == 'img':
            self.images.append(attrs)


url = 'https://account.reyuugames.com/branding-example?example=one&another=two'
context = {
    'user': SimpleNamespace(username='branding-example', name='Brand <Example>'),
    'url': url, 'host': 'reyuuGAMES Account', 'expires': now() + timedelta(minutes=10),
    'token': '000000', 'title': 'Account security notification',
    'body': 'This is a synthetic branding preview.',
    'link': {'target': url, 'label': 'Review account'},
    'key_value': {'Example': '<escaped>'},
}
names = [
    'reyuugames/account_confirmation.html', 'reyuugames/password_reset.html',
    'email/account_confirmation.html', 'email/password_reset.html',
    'email/email_otp.html', 'email/event_notification.html',
    'email/invitation.html', 'email/setup.html',
]
results = []
preview = None
for name in names:
    message = TemplateEmailMessage(
        to=[('Branding preview', 'branding-example@example.invalid')],
        subject='reyuuGAMES Account — branding preview',
        template_name=name, template_context=context,
    )
    html = next(body for body, kind in message.alternatives if kind == 'text/html')
    assert 'authentik' not in html.lower(), f'Vendor residue in {name}'
    assert 'cid:logo' not in html, f'Unexpected upstream CID logo in {name}'
    parsed = Links()
    parsed.feed(html)
    assert any(image.get('alt') == 'reyuuGAMES Account' and
               image.get('src') == 'https://account.reyuugames.com/static/dist/assets/reyuugames/reyuu-account-logo.png'
               for image in parsed.images), f'Wrong logo in {name}'
    action = 'confirmation' in name or 'reset' in name or 'invitation' in name
    if action:
        assert url in parsed.hrefs, f'Action URL changed in {name}'
    if 'confirmation' in name or 'reset' in name:
        assert url in message.body and 'reyuuGAMES Account' in message.body
        assert 'authentik' not in message.body.lower()
    if 'reset' in name:
        assert 'Brand &lt;Example&gt;' in html
    if 'event_notification' in name:
        assert '&lt;escaped&gt;' in html
    results.append({'template': name, 'vendor_free': True,
                    'plain_text': bool(message.body), 'action_preserved': action})
    if name == names[0]:
        preview = html

brand = Brand.objects.get(default=True)
request = RequestFactory().get('/', secure=True, HTTP_HOST='account.reyuugames.com')
request.brand = brand
request.user = AnonymousUser()
error = render_to_string('if/error.html', {'brand': brand, 'request': request,
    'title': 'Unable to continue', 'message': 'This example request is no longer valid.',
    'footer_links': [{'name': 'Help', 'href': 'https://reyuugames.com'}]})
assert 'authentik Logo' not in error and 'Powered by authentik' not in error
assert 'Help' in error and 'Unable to continue' in error
assert get_template('if/flow.html').origin.name.startswith('/templates/')
print('BRANDING_VERIFIED ' + json.dumps({'emails': results,
    'static_error_vendor_free': True, 'configured_footer_preserved': True,
    'sender_branded': settings.DEFAULT_FROM_EMAIL.startswith('reyuuGAMES Account <'),
    'flow_overlay_installed': True,
    'preview_zlib_b64': base64.b64encode(zlib.compress(preview.encode())).decode()}))
