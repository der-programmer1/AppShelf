#!/usr/bin/env python3
"""Exercise the real rootless ingress, verified internal TLS and keyless API."""
import argparse
import base64
import http.client
import json
import os
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--image', default='origincheck-hosting:0.1.0')
args = parser.parse_args()
env = dict(os.environ)
for selector in ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'):
    env.pop(selector, None)
docker = ['docker', '--host=unix:///var/run/docker.sock']

def run(*command):
    return subprocess.check_output(docker + list(command), env=env, text=True).strip()

image = json.loads(run('image', 'inspect', args.image))[0]
assert image['Config']['User'] == 'node', 'Hosting must run without root'
assert not any(value.startswith('OPENAI_API_KEY=') for value in image['Config'].get('Env', [])), 'No API credential belongs in an image'
options = []
bundle = os.environ.get('ORIGINCHECK_DOCKER_CA_BUNDLE')
if bundle:
    options = ['--mount', f'type=bind,src={bundle},dst=/run/host-proxy-ca.pem,readonly', '-e', 'NODE_EXTRA_CA_CERTS=/run/host-proxy-ca.pem']
container = run('run', '-d', '-p', '127.0.0.1::10000', *options, args.image)
checks = []
try:
    port = int(json.loads(run('inspect', container))[0]['NetworkSettings']['Ports']['10000/tcp'][0]['HostPort'])

    def request(method, target, data=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
        try:
            connection.request(method, target, body=data, headers=headers or {})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    for attempt in range(60):
        try:
            if request('GET', '/health')[0] == 503:
                break
        except (OSError, http.client.HTTPException):
            pass
        time.sleep(0.2)
    else:
        raise AssertionError('Container did not expose the actual keyless API')

    origin = 'https://der-programmer1.github.io'
    status, headers, body = request('GET', '/health', headers={'Origin': origin})
    value = json.loads(body)
    assert status == 503 and value['error']['code'] == 'backend_not_configured'
    assert value['providerConnectivity'] == 'not_tested' and 'verdict' not in value
    checks.append('Real hosting ingress reaches HTTPS backend without a key and returns honest 503')
    assert headers.get('Access-Control-Allow-Origin') == origin
    checks.append('AppShelf CORS is preserved through the ingress')
    assert request('OPTIONS', '/v1/analyze', headers={'Origin': origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type, X-OriginCheck-Consent'})[0] == 204
    checks.append('CORS preflight returns 204')
    assert request('GET', '/health', headers={'Origin': 'https://unapproved.invalid'})[0] == 403
    checks.append('Unapproved browser origins remain rejected')
    assert request('POST', '/v1/analyze', b'x', {'Content-Type': 'image/jpeg'})[0] == 400
    checks.append('Consent remains mandatory')
    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==')
    status, _, body = request('POST', '/v1/analyze', png, {'Content-Type': 'image/png', 'X-OriginCheck-Consent': 'yes', 'Origin': origin})
    assert status == 503 and 'verdict' not in json.loads(body)
    checks.append('A real PNG never receives a fabricated analysis without a provider key')
    assert request('POST', '/v1/analyze', b'x', {'Content-Length': '25000001', 'X-OriginCheck-Consent': 'yes', 'Content-Type': 'image/jpeg'})[0] == 413
    checks.append('Public ingress independently enforces the exact 25 MB upload limit')
    statuses = [request('POST', '/v1/analyze', png, {'Content-Type': 'image/png', 'X-OriginCheck-Consent': 'yes'})[0] for _ in range(10)]
    assert 429 in statuses and all(status in (503, 429) for status in statuses)
    checks.append('Default global rate limit also applies through the ingress')
    state = json.loads(run('exec', container, 'node', '-e', "const fs=require('fs');const dirs=fs.readdirSync('/tmp').filter(x=>x.startsWith('origincheck.'));console.log(JSON.stringify(dirs.flatMap(d=>['unused-body-cache','unused-proxy-cache'].flatMap(n=>{const p='/tmp/'+d+'/'+n;return fs.existsSync(p)?fs.readdirSync(p):[]}))));"))
    assert state == [], 'Original media must not be buffered on disk'
    logs = run('logs', container)
    assert base64.b64encode(png).decode() not in logs and '/v1/analyze' not in logs and 'OPENAI_API_KEY=' not in logs
    checks.append('No body-cache files or request/media/access logs were created')
    print(json.dumps({'passed': len(checks), 'checks': checks, 'runsAsNonRoot': True, 'liveOpenAI': False, 'publicHostingDeployment': False}, indent=2))
except Exception:
    subprocess.run(docker + ['logs', container], env=env, check=False)
    raise
finally:
    subprocess.run(docker + ['stop', '--time', '5', container], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(docker + ['rm', '--force', container], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
