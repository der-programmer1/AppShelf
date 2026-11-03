#!/usr/bin/env python3
"""Require actual passing Android tests; a zero-test Gradle success is insufficient."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET

project = Path(__file__).resolve().parents[1] / 'android'

def checked(folder, expected):
    cases = []
    for file in folder.rglob('TEST-*.xml'):
        cases.extend(ET.parse(file).getroot().iter('testcase'))
    assert len(cases) == expected, f'Expected {expected} actual tests, got {len(cases)}'
    for case in cases:
        assert not any(case.find(tag) is not None for tag in ('failure', 'error', 'skipped')), case.get('name')
    return {'tests':len(cases), 'failures':0, 'errors':0, 'skipped':0,
            'cases':sorted(case.get('name') for case in cases)}

print(json.dumps({'unit':checked(project/'app/build/test-results/testDebugUnitTest',10),
                 'emulator':checked(project/'app/build/outputs/androidTest-results/connected',5)},indent=2))
