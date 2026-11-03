#!/usr/bin/env python3
"""Publish only genuine built APK bytes, complete sources and matching static PWA files."""
import argparse
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import zipfile

project=Path(__file__).resolve().parents[1]
repo=project.parents[1]
target=repo/'apps/inbox/origincheck'
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');options=parser.parse_args()
raw=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','.'],cwd=project)
files=sorted(set(name.decode() for name in raw.split(b'\0') if name))
required={'README.md','.env.example','.gitignore','package.json','package-lock.json','android/gradlew','android/gradlew.bat',
 'android/gradle/wrapper/gradle-wrapper.jar','android/gradle/wrapper/gradle-wrapper.properties','android/app/build.gradle',
 'android/app/src/main/AndroidManifest.xml','backend/server.js','backend/provider.js','backend/package-lock.json',
 'backend/.env.example','backend/test/server.test.js','backend/Dockerfile','backend/hosting/entrypoint.sh','backend/hosting/nginx.conf.template','backend/hosting/test_container.py','web/index.html','web/app.js','web/style.css','web/manifest.webmanifest','web/sw.js',
 'tests/browser.mjs','tests/web.test.js','scripts/package.py'}
assert required <= set(files), 'Incomplete source handoff: '+str(required-set(files))
assert any('/src/test/' in name for name in files) and any('/src/androidTest/' in name for name in files)
for name in files:
    relative=PurePosixPath(name);file=project/name
    assert not relative.is_absolute() and '..' not in relative.parts and '\\' not in name
    assert not set(relative.parts)&{'build','.gradle','.kotlin','.git','node_modules','__pycache__'}
    assert relative.name not in {'local.properties','.env','.env.local'}
    assert relative.suffix.lower() not in {'.pem','.key','.keystore','.jks','.p12','.pfx','.apk','.aab'}
    assert file.is_file() and not file.is_symlink()
    if relative.suffix.lower() not in {'.jar','.png','.mp4'}:
        content=file.read_bytes()
        assert not re.search(rb'/(?:workspace|Users|home)/',content), 'Local absolute path: '+name
        assert not re.search(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',content), 'Private key: '+name
        assert not re.search(rb'sk-[A-Za-z0-9_-]{20,}',content), 'Possible secret: '+name
archive=target/'OriginCheck-0.1.0-source.zip';apk=target/'OriginCheck-0.1.0-debug.apk'
built=project/'android/app/build/outputs/apk/debug/app-debug.apk'
webfiles=sorted(name for name in files if name.startswith('web/'))
if not options.check:
    assert built.is_file() and built.stat().st_size>1024
    target.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(built,apk)
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as output:
        for name in files:
            info=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=(0o755 if name=='android/gradlew' else 0o644)<<16
            output.writestr(info,(project/name).read_bytes())
    for name in webfiles:
        destination=target/'demo'/name.removeprefix('web/');destination.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(project/name,destination)
with zipfile.ZipFile(archive) as zipped:
    assert zipped.testzip() is None and set(zipped.namelist())==set(files) and len(zipped.namelist())==len(files)
    for name in files:assert zipped.read(name)==(project/name).read_bytes(), 'Source differs: '+name
with zipfile.ZipFile(apk) as zipped:
    assert zipped.testzip() is None and {'AndroidManifest.xml','classes.dex'}<=set(zipped.namelist())
if built.exists() and not options.check:assert apk.read_bytes()==built.read_bytes(), 'APK differs from actual local debug build'
assert {(target/'demo'/name.removeprefix('web/')).relative_to(target/'demo').as_posix() for name in webfiles}=={p.relative_to(target/'demo').as_posix() for p in (target/'demo').rglob('*') if p.is_file()}
for name in webfiles:assert (target/'demo'/name.removeprefix('web/')).read_bytes()==(project/name).read_bytes()
assert (target/'screenshots').is_dir() and any((target/'screenshots').iterdir())
print(f'PASS: {len(files)} exact source files; {len(webfiles)} matching PWA files; genuine APK {apk.stat().st_size} bytes.')
