"""Install a JSON {relative path: base64 bytes} bundle from stdin in the server.

This copies only public assets, templates and the presentation maintenance
script to existing persistent volumes. Backups stay outside served directories.
"""
import base64
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path('/data/reyuugames-branding-backups')
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
backup = root / stamp
bundle = json.load(sys.stdin)
destinations = {}
for relative, encoded in bundle.items():
    path = Path(relative)
    assert not path.is_absolute() and '..' not in path.parts
    if relative.startswith('templates/'):
        dest = Path('/templates') / path.relative_to('templates')
    elif relative.startswith('assets/'):
        dest = Path('/data/media/public/reyuugames') / path.relative_to('assets')
    elif relative in ('apply.py', 'verify.py', 'brand.css'):
        dest = Path('/templates/reyuugames') / relative
    else:
        raise ValueError('Unsupported bundle path')
    destinations[dest] = base64.b64decode(encoded, validate=True)

manifest = []
for dest, content in destinations.items():
    old = backup / str(dest).lstrip('/')
    if dest.exists():
        old.parent.mkdir(parents=True, exist_ok=True)
        old.write_bytes(dest.read_bytes())
    manifest.append({'path': str(dest), 'existed': dest.exists()})
    dest.parent.mkdir(parents=True, exist_ok=True)
    pending = dest.with_name(dest.name + '.branding-pending')
    pending.write_bytes(content)
    pending.chmod(0o644)
    pending.replace(dest)
backup.mkdir(parents=True, exist_ok=True)
(backup / 'manifest.json').write_text(json.dumps(manifest, indent=2))
print('BRANDING_INSTALLED ' + json.dumps({'files': len(manifest), 'backup': str(backup)}))
