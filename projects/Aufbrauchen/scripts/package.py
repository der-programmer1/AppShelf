#!/usr/bin/env python3
"""Package genuine Android output, complete sources, and the exact tested web app."""
from pathlib import Path,PurePosixPath
import json
import re
import shutil
import subprocess
import sys
import zipfile

project=Path(__file__).resolve().parents[1]
repo=project.parents[1]
target=repo/'apps/inbox/aufbrauchen'
check='--check' in sys.argv
subprocess.run([sys.executable,str(project/'scripts/build-web.py'),'--check'],check=True)
version=json.loads((project/'package.json').read_text())['version']
archive=target/f'Aufbrauchen-{version}-source.zip'
apk=target/f'Aufbrauchen-{version}.apk'
raw=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','.'],cwd=project)
files=sorted(set(x.decode() for x in raw.split(b'\0') if x))
required={'.gitignore','README.md','package.json','package-lock.json','android/gradlew','android/gradle/wrapper/gradle-wrapper.jar','android/app/src/main/AndroidManifest.xml','web/index.html','web/app.js','web/model.js','web/manifest.webmanifest','web/sw.js','tests/model.test.js','tests/browser.mjs','tests/fixtures/scenarios.json','scripts/package.py'}
assert required<=set(files),'Incomplete source handoff'
assert any('/src/test/' in x for x in files) and any('/src/androidTest/' in x for x in files)
for name in files:
    path=PurePosixPath(name);file=project/name
    assert not path.is_absolute() and '..' not in path.parts and not file.is_symlink()
    assert not set(path.parts)&{'node_modules','build','.gradle','.kotlin','__pycache__','.git','test-results'}
    assert path.name not in {'.env','local.properties'} and path.suffix not in {'.jks','.keystore','.pem','.key','.apk','.aab'}
    if path.suffix not in {'.png','.jar'}:
        content=file.read_bytes()
        assert not re.search(rb'/(?:workspace|Users|home)/|sk-proj-[A-Za-z0-9_-]{12,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY',content),'Private content in source: '+name
web={p.name:p.read_bytes() for p in (project/'web').iterdir() if p.is_file()}
if not check:
    built=project/'android/app/build/outputs/apk/release/app-release.apk'
    assert built.is_file() and built.stat().st_size>1024,'Build a real APK first'
    target.mkdir(parents=True,exist_ok=True)
    (target/'demo').mkdir(exist_ok=True)
    for old in (target/'demo').iterdir():assert old.name in web,'Refusing to delete unexpected web content'
    for name,content in web.items():(target/'demo'/name).write_bytes(content)
    with zipfile.ZipFile(archive.with_suffix('.zip.tmp'),'w',compression=zipfile.ZIP_DEFLATED) as z:
        for name in files:
            info=zipfile.ZipInfo('Aufbrauchen/'+name,date_time=(2026,11,4,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=(0o755 if name=='android/gradlew' else 0o644)<<16;z.writestr(info,(project/name).read_bytes())
    archive.with_suffix('.zip.tmp').replace(archive)
    shutil.copyfile(built,apk.with_suffix('.apk.tmp'));apk.with_suffix('.apk.tmp').replace(apk)
assert {p.name:p.read_bytes() for p in (target/'demo').iterdir() if p.is_file()}==web,'Published PWA differs'
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None and len(z.namelist())==len(files)
    assert set(z.namelist())=={'Aufbrauchen/'+name for name in files}
    for name in files:assert z.read('Aufbrauchen/'+name)==(project/name).read_bytes(),'Stale source: '+name
with zipfile.ZipFile(apk) as z:assert z.testzip() is None and {'AndroidManifest.xml','classes.dex'}<=set(z.namelist())
print(f'PASS: {len(files)} exact Android/web/test source files; {len(web)} exact PWA assets; genuine APK {apk.stat().st_size} bytes')
