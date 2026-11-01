#!/usr/bin/env python3
"""Build/check the source handoff from reviewable Git source files, excluding outputs."""
import argparse
from pathlib import Path
import shutil
import subprocess
import zipfile

project=Path(__file__).resolve().parents[1]
repo=project.parents[1]
target=repo/'apps/inbox/leistenplan'
archive=target/'LeistenPlan-1.0.0-source.zip'
apk=target/'LeistenPlan-1.0.0.apk'
args=argparse.ArgumentParser()
args.add_argument('--check',action='store_true')
options=args.parse_args()
raw=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','.'],cwd=project)
files=sorted(set(x.decode() for x in raw.split(b'\0') if x))
assert files and 'app/src/main/java/de/appshelf/leistenplan/MainActivity.java' in files
for name in files:
    file=project/name
    assert not file.is_symlink() and file.is_file(), 'Unsupported source entry: '+name
    assert not any(part in ('build','.gradle','.git','__pycache__') for part in Path(name).parts), 'Generated file in source handoff'
if not options.check:
    target.mkdir(parents=True,exist_ok=True)
    temporary=archive.with_suffix('.zip.tmp')
    with zipfile.ZipFile(temporary,'w',compression=zipfile.ZIP_DEFLATED) as output:
        for name in files:
            info=zipfile.ZipInfo('LeistenPlan/'+name,date_time=(1980,1,1,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=(0o755 if name=='gradlew' else 0o644)<<16
            output.writestr(info,(project/name).read_bytes())
    temporary.replace(archive)
    built=project/'app/build/outputs/apk/debug/app-debug.apk'
    assert built.stat().st_size>1024
    shutil.copyfile(built,apk)
with zipfile.ZipFile(archive) as zipped:
    assert zipped.testzip() is None
    expected={'LeistenPlan/'+name for name in files}
    assert len(zipped.namelist())==len(expected) and set(zipped.namelist())==expected, 'Source ZIP membership differs'
    for name in files:
        assert zipped.read('LeistenPlan/'+name)==(project/name).read_bytes(), 'Source ZIP differs: '+name
with zipfile.ZipFile(apk) as zipped:
    assert zipped.testzip() is None
    assert 'AndroidManifest.xml' in zipped.namelist() and 'classes.dex' in zipped.namelist()
assert apk.stat().st_size>1024
print(f'Package verified: {len(files)} matching source files, readable source ZIP, APK {apk.stat().st_size} bytes.')
