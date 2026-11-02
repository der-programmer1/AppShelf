#!/usr/bin/env python3
"""Reject zero-test, skipped or failing Gradle runs before a Weiter release."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET

project = Path(__file__).resolve().parents[1]

def checked(folder, minimum):
    files = sorted(folder.rglob('TEST-*.xml'))
    assert files, 'Missing test reports'
    cases = []
    for file in files:
        cases.extend(ET.parse(file).getroot().iter('testcase'))
    assert len(cases) >= minimum, f'Only {len(cases)} actual test cases, need at least {minimum}'
    for case in cases:
        assert not any(case.find(tag) is not None for tag in ('failure', 'error', 'skipped')), case.get('name')
    return {'tests': len(cases), 'failures': 0, 'errors': 0, 'skipped': 0,
        'cases': sorted(case.get('classname', '') + '.' + case.get('name', '') for case in cases)}

result = {'status': 'passed',
    'unit': checked(project/'app/build/test-results/testDebugUnitTest', 35),
    'android': checked(project/'app/build/outputs/androidTest-results/connected', 12)}
print(json.dumps(result, indent=2))
