#!/usr/bin/env python3
"""Verify real APK CRC, signature and merged manifest, never infer them from filenames."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

apk=Path(sys.argv[1])
with zipfile.ZipFile(apk) as archive:
    assert archive.testzip() is None
    assert {'AndroidManifest.xml','classes.dex'} <= set(archive.namelist())
sdk=Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT'])
subprocess.run([str(sdk/'build-tools/36.0.0/apksigner'),'verify',str(apk)],check=True)
root=ET.fromstring(subprocess.check_output(['apkanalyzer','manifest','print',str(apk)]))
a='{http://schemas.android.com/apk/res/android}'
assert root.get('package')=='de.appshelf.origincheck'
assert root.get(a+'versionName')=='0.1.0' and root.get(a+'versionCode')=='1'
uses=root.find('uses-sdk');assert uses.get(a+'minSdkVersion')=='26' and uses.get(a+'targetSdkVersion')=='36'
app=root.find('application')
assert app.get(a+'allowBackup')=='false' and app.get(a+'usesCleartextTraffic')=='false'
permissions={node.get(a+'name') for node in root.findall('uses-permission')}
assert permissions=={'android.permission.INTERNET','android.permission.ACCESS_NETWORK_STATE','de.appshelf.origincheck.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'},permissions
activities=app.findall('activity');assert len(activities)==1 and activities[0].get(a+'name')=='de.appshelf.origincheck.MainActivity'
assert {'android.intent.action.SEND','android.intent.action.MAIN'} <= {node.get(a+'name') for node in activities[0].iter('action')}
assert {'image/*','video/*','text/plain'} <= {node.get(a+'mimeType') for node in activities[0].iter('data')}
print(json.dumps({'status':'passed','package':'de.appshelf.origincheck','version':'0.1.0','versionCode':1,
    'minSdk':26,'targetSdk':36,'signatureVerified':True,'permissions':sorted(permissions),
    'debuggable':app.get(a+'debuggable','false')=='true','size':apk.stat().st_size,
    'sha256':hashlib.sha256(apk.read_bytes()).hexdigest()},indent=2))
