#!/usr/bin/env python3
"""Verify the actual signed sideload release, including its merged Android manifest."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

apk = Path(sys.argv[1] if len(sys.argv) > 1 else 'app/build/outputs/apk/release/app-release.apk')
with zipfile.ZipFile(apk) as zipped:
    assert zipped.testzip() is None, 'APK CRC failure'
    assert {'AndroidManifest.xml', 'classes.dex'} <= set(zipped.namelist()), 'APK is incomplete'
sdk = Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT'])
subprocess.run([str(sdk/'build-tools/36.0.0/apksigner'), 'verify', str(apk)], check=True)
manifest = subprocess.check_output(['apkanalyzer', 'manifest', 'print', str(apk)])
root = ET.fromstring(manifest)
a = '{http://schemas.android.com/apk/res/android}'
assert root.get('package') == 'de.appshelf.weiter'
assert root.get(a+'versionName') == '1.0.0' and root.get(a+'versionCode') == '1'
uses = root.find('uses-sdk')
assert uses.get(a+'minSdkVersion') == '26' and uses.get(a+'targetSdkVersion') == '36'
app = root.find('application')
assert app.get(a+'debuggable', 'false') == 'false', 'Distribution build must not be debuggable'
assert app.get(a+'allowBackup') == 'false'
permissions = {node.get(a+'name') for node in root.findall('uses-permission')}
assert permissions == {'android.permission.RECORD_AUDIO', 'android.permission.POST_NOTIFICATIONS',
    'android.permission.RECEIVE_BOOT_COMPLETED', 'de.appshelf.weiter.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'}, permissions
activities = app.findall('activity')
assert len(activities) == 1 and activities[0].get(a+'name') == 'de.appshelf.weiter.MainActivity', 'Unexpected activity in release'
actions = {node.get(a+'name') for node in activities[0].iter('action')}
assert {'android.intent.action.MAIN', 'android.intent.action.SEND'} <= actions
assert any(node.get(a+'mimeType') == 'text/plain' for node in activities[0].iter('data'))
result = {'status':'passed', 'package':'de.appshelf.weiter', 'version':'1.0.0', 'versionCode':1,
    'minSdk':26, 'targetSdk':36, 'debuggable':False, 'signatureVerified':True,
    'permissions':sorted(permissions), 'size':apk.stat().st_size,
    'sha256':hashlib.sha256(apk.read_bytes()).hexdigest()}
print(json.dumps(result, indent=2))
