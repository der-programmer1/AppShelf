#!/bin/bash
set -euo pipefail
umask 077

public_port="${PORT:-10000}"
if [[ ! "$public_port" =~ ^[1-9][0-9]{3,4}$ ]] || (( public_port < 1024 || public_port > 65535 || public_port == 8443 )); then
  echo 'OriginCheck: ungültiger öffentlicher Container-Port.' >&2
  exit 1
fi

runtime_dir="$(mktemp -d /tmp/origincheck.XXXXXXXX)"
backend_pid=''
proxy_pid=''
cleanup() {
  trap - EXIT
  if [[ -n "$backend_pid" ]]; then kill "$backend_pid" 2>/dev/null || true; fi
  if [[ -n "$proxy_pid" ]]; then kill "$proxy_pid" 2>/dev/null || true; fi
  wait 2>/dev/null || true
  rm -rf -- "$runtime_dir"
}
trap cleanup EXIT
trap 'exit 0' TERM INT

# Fresh private loopback identity at each start; never copied into an image.
# Render separately manages the automatically renewed public HTTPS certificate.
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -subj /CN=localhost -addext subjectAltName=DNS:localhost,IP:127.0.0.1 \
  -keyout "$runtime_dir/backend-key.pem" -out "$runtime_dir/backend-cert.pem" \
  >/dev/null 2>&1

sed -e "s/__PUBLIC_PORT__/$public_port/g" -e "s#__RUNTIME_DIR__#$runtime_dir#g" \
  hosting/nginx.conf.template > "$runtime_dir/nginx.conf"

PORT=8443 BIND_HOST=127.0.0.1 TLS_CERT_FILE="$runtime_dir/backend-cert.pem" \
  TLS_KEY_FILE="$runtime_dir/backend-key.pem" node server.js &
backend_pid=$!
nginx -p "$runtime_dir/" -c "$runtime_dir/nginx.conf" -g 'daemon off;' &
proxy_pid=$!

# Let the platform restart the whole service if either process stops.
set +e
wait -n "$backend_pid" "$proxy_pid"
status=$?
exit "$status"
