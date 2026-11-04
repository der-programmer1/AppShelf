#!/usr/bin/env python3
"""Require real, non-skipped tests; a compiled test APK alone is not an emulator run."""
from pathlib import Path
import json
import sys
import xml.etree.ElementTree as ET

root=Path(__file__).resolve().parents[1]/'android/app/build'
def checked(folder,minimum):
    cases=[]
    for file in folder.rglob('TEST-*.xml'):cases.extend(ET.parse(file).getroot().iter('testcase'))
    assert len(cases)>=minimum,f'Missing tests: {folder.name}'
    assert all(not any(case.find(tag)is not None for tag in ['failure','error','skipped']) for case in cases),'Failed/skipped tests'
    return {'tests':len(cases),'failures':0,'errors':0,'skipped':0}
result={'unit':checked(root/'test-results/testDebugUnitTest',21)}
if '--unit-only' not in sys.argv:result['emulator']=checked(root/'outputs/androidTest-results/connected',4)
print(json.dumps(result,indent=2))
