#!/usr/bin/env python3
"""Package the complete reviewable Weiter source and the genuinely built APK."""
import argparse
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import zipfile

project = Path(__file__).resolve().parents[1]
repo = project.parents[1]
target = repo / 'apps/inbox/weiter'
match = re.search(r"versionName '([0-9]+\.[0-9]+\.[0-9]+)'", (project / 'app/build.gradle').read_text())
assert match, 'A valid app version is required'
version = match.group(1)
archive = target / f'Weiter-{version}-source.zip'
apk = target / f'Weiter-{version}.apk'
parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
parser.add_argument('--source-only', action='store_true', help='Repackage source without rebuilding or replacing the APK')
options = parser.parse_args()
if options.check and options.source_only:
    parser.error('--check and --source-only are mutually exclusive')
raw = subprocess.check_output(
    ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '.'], cwd=project)
files = sorted(set(name.decode('utf-8') for name in raw.split(b'\0') if name))
required = {
    '.gitignore', 'README.md', 'gradlew', 'gradlew.bat', 'settings.gradle', 'build.gradle',
    'app/build.gradle', 'gradle/wrapper/gradle-wrapper.jar',
    'gradle/wrapper/gradle-wrapper.properties', 'app/src/main/AndroidManifest.xml',
    'app/src/main/java/de/appshelf/weiter/MainActivity.kt', 'scripts/package.py',
}
assert required <= set(files), 'The source handoff is incomplete'
assert any(name.startswith('app/src/test/') for name in files), 'Unit tests are required'
assert any(name.startswith('app/src/androidTest/') for name in files), 'Android tests are required'
blocked_parts = {'build', '.gradle', '.kotlin', '.git', '__pycache__', 'node_modules'}
blocked_suffixes = {'.jks', '.keystore', '.p12', '.pfx', '.pem', '.key', '.apk', '.aab'}
for name in files:
    relative = PurePosixPath(name)
    file = project / name
    assert not relative.is_absolute() and '..' not in relative.parts and '\\' not in name, 'Unsafe source path'
    assert not any(part in blocked_parts for part in relative.parts), 'Generated file in source handoff: ' + name
    assert relative.name not in {'local.properties', '.env', '.env.local'}, 'Local configuration in source handoff'
    assert relative.suffix.lower() not in blocked_suffixes, 'Private key or build artifact in source handoff'
    assert not file.is_symlink() and file.is_file(), 'Unsupported source entry: ' + name
    if relative.suffix != '.jar':
        content = file.read_bytes()
        assert not re.search(rb'/(?:workspace|Users|home)/', content), 'Local absolute path in source: ' + name
        assert not re.search(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', content), 'Private key in source'

sources = {'Weiter/' + name: (project / name).read_bytes() for name in files}
web = target / 'demo'
required_web = {'index.html', 'manifest.webmanifest', 'sw.js', 'icon.svg'}
web_files = sorted(web.iterdir())
assert required_web <= {file.name for file in web_files}, 'The Web/PWA handoff is incomplete'
for file in web_files:
    assert file.is_file() and not file.is_symlink(), 'Expected a regular web asset: ' + file.name
    assert re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', file.name), 'Unsafe web asset name'
    sources['Weiter/web/' + file.name] = file.read_bytes()

if not options.check and not options.source_only:
    built = project / 'app/build/outputs/apk/release/app-release.apk'
    assert built.is_file() and built.stat().st_size > 1024, 'Build a real APK before packaging'
    with zipfile.ZipFile(built) as zipped:
        assert zipped.testzip() is None, 'Built APK ZIP is corrupt'
        assert {'AndroidManifest.xml', 'classes.dex'} <= set(zipped.namelist()), 'Built APK is incomplete'
if not options.check:
    target.mkdir(parents=True, exist_ok=True)
    temporary = archive.with_suffix('.zip.tmp')
    with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED) as output:
        for name, content in sorted(sources.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o755 if name == 'Weiter/gradlew' else 0o644) << 16
            output.writestr(info, content)
    temporary.replace(archive)
if not options.check and not options.source_only:
    temporary_apk = apk.with_suffix('.apk.tmp')
    shutil.copyfile(built, temporary_apk)
    temporary_apk.replace(apk)

with zipfile.ZipFile(archive) as zipped:
    assert zipped.testzip() is None, 'Source ZIP is corrupt'
    expected = set(sources)
    assert len(zipped.namelist()) == len(expected) and set(zipped.namelist()) == expected, 'Source ZIP membership differs'
    for name, content in sources.items():
        assert zipped.read(name) == content, 'Source ZIP differs: ' + name
with zipfile.ZipFile(apk) as zipped:
    assert zipped.testzip() is None, 'APK ZIP is corrupt'
    assert {'AndroidManifest.xml', 'classes.dex'} <= set(zipped.namelist()), 'APK is incomplete'
assert apk.stat().st_size > 1024, 'APK is empty or suspiciously small'
print(f'Package verified: {len(sources)} matching Android and web source files, readable source ZIP, APK {apk.stat().st_size} bytes.')
