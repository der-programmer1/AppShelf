#!/usr/bin/env python3
"""Generate the self-contained PWA shell. Cache versions follow actual file content."""
from pathlib import Path
import hashlib
import json
import sys

root=Path(__file__).resolve().parents[1]
web=root/'web'
manifest={'id':'./','name':'Aufbrauchen','short_name':'Aufbrauchen','lang':'de','start_url':'./','scope':'./','display':'standalone','background_color':'#f8f6ef','theme_color':'#27634b','description':'Vorräte im Blick. Erst aufbrauchen, dann nachkaufen.','icons':[{'src':f'icon-{size}.png','sizes':f'{size}x{size}','type':'image/png'} for size in [192,512]]}
manifest_bytes=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
files={p.name:p.read_bytes() for p in web.iterdir() if p.is_file() and p.name not in {'manifest.webmanifest','sw.js'}}
assert all(Path(name).suffix in {'.js','.html','.css','.svg','.png'} for name in files),'Unexpected/private file in web source'
files['manifest.webmanifest']=manifest_bytes
digest=hashlib.sha256(b''.join(k.encode()+v for k,v in sorted(files.items()))).hexdigest()[:16]
assets=['./']+['./'+name for name in sorted(files)]
worker=f'''// Static application files only. User entries and backups never enter this cache.
const CACHE="appshelf-aufbrauchen-{digest}";
const FILES={json.dumps(assets)};
const ALLOWED=new Set(FILES.map(file=>new URL(file,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(file=>new Request(file,{{cache:'reload'}}))))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('appshelf-aufbrauchen-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(!ALLOWED.has(url.href))return;
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request))||fetch(event.request)));
}});
'''
for name,content in {'manifest.webmanifest':manifest_bytes,'sw.js':worker.encode()}.items():
    if '--check' in sys.argv:
        assert (web/name).read_bytes()==content, f'{name} is stale'
    else:(web/name).write_bytes(content)
print('PWA manifest and content-versioned offline shell '+('verified' if '--check' in sys.argv else 'generated'))
