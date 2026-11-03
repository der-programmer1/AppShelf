#!/usr/bin/env python3
"""Materialise self-contained offline PWAs and reproducible, complete web source ZIPs.

The existing Android projects and their APKs/source archives are never rewritten.
"""
from pathlib import Path
import hashlib
import json
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CHECK = '--check' in sys.argv
for slug, name, color in [('weiter', 'Weiter', '#276852'), ('gymdelay', 'GymDelay', '#101c2c'), ('sehplus', 'SehPlus', '#0e1214')]:
    source = ROOT / 'web-apps' / slug
    target = ROOT / 'apps' / 'inbox' / slug / 'demo'
    manifest = json.loads((target.parent / 'app.json').read_text())
    files = {p.name: p.read_bytes() for p in source.iterdir() if p.is_file() and p.name != 'README.md'}
    files['storage.js'] = (ROOT / 'web-apps/shared/storage.js').read_bytes()
    if slug != 'sehplus':
        files['style.css'] = (ROOT / 'web-apps/shared/style.css').read_bytes()
    pwa = {'id': './', 'name': name, 'short_name': name, 'lang': 'de', 'start_url': './', 'scope': './', 'display': 'standalone', 'background_color': color, 'theme_color': color,
           'icons': [{'src': f'icon-{size}.png', 'sizes': f'{size}x{size}', 'type': 'image/png'} for size in (192, 512)]}
    if slug == 'weiter':
        pwa['share_target'] = {'action': './', 'method': 'GET', 'params': {'title': 'title', 'text': 'text', 'url': 'url'}}
    files['manifest.webmanifest'] = (json.dumps(pwa, ensure_ascii=False, indent=2) + '\n').encode()
    digest = hashlib.sha256(b'shell-v2' + b''.join(k.encode() + v for k, v in sorted(files.items()))).hexdigest()[:16]
    prefix = f'appshelf-{slug}-'
    assets = ['./'] + ['./' + key for key in sorted(files)]
    sw = f"""// Generated from all shell assets. No user data or selected media are cached here.
const CACHE={json.dumps(prefix + digest)}, PREFIX={json.dumps(prefix)}, ASSETS={json.dumps(assets)};
const ALLOWED=new Set(ASSETS.map(asset=>new URL(asset,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(url=>new Request(url,{{cache:'reload'}}))))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url), scope=new URL(self.registration.scope);
  if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  const relative='./'+url.pathname.slice(scope.pathname.length);
  // Strip incoming shared text only for navigation, never cache a user's query.
  if(event.request.mode==='navigate'&&(relative==='./'||relative==='./index.html'))url.search='';
  if(!ALLOWED.has(url.href))return;
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.href))||fetch(event.request)));
}});
"""
    files['sw.js'] = sw.encode()
    if CHECK:
        actual = {p.relative_to(target).as_posix(): p.read_bytes() for p in target.rglob('*') if p.is_file()}
        if actual != files:
            raise SystemExit(f'{slug}: web mirror is stale; run python3 scripts/package-web-apps.py')
    else:
        target.mkdir(exist_ok=True)
        for old in target.rglob('*'):
            if old.is_file() and old.relative_to(target).as_posix() not in files:
                raise SystemExit(f'Unexpected existing web file: {old.relative_to(ROOT)}; refusing to remove it')
        for filename, content in files.items():
            (target / filename).write_bytes(content)
    archive = target.parent / f'{name}-{manifest["version"]}-web-source.zip'
    expected = {'web/' + k: v for k, v in files.items()}
    expected['README.md'] = (source / 'README.md').read_bytes()
    if CHECK:
        with zipfile.ZipFile(archive) as z:
            if z.testzip() or {n: z.read(n) for n in z.namelist()} != expected or len(z.namelist()) != len(expected):
                raise SystemExit(f'{slug}: incomplete web source archive')
    else:
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for filename, content in sorted(expected.items()):
                info = zipfile.ZipInfo(filename, date_time=(2026, 11, 3, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                z.writestr(info, content)
    print(f'{slug}: complete PWA and web source ZIP {"verified" if CHECK else "packaged"} ({len(files)} assets)')
