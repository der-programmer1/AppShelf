# syntax=docker/dockerfile:1
FROM node:22.23.0-bookworm-slim

# Optional build-only CA bundle for managed development, absent on Render.
# No session certificate or credential is copied into the image.
RUN --mount=type=secret,id=proxy_bundle \
    set -eu; \
    if [ -f /run/secrets/proxy_bundle ]; then \
      apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_bundle update; \
      apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_bundle install -y --no-install-recommends nginx-light openssl ca-certificates; \
    else \
      apt-get update; \
      apt-get install -y --no-install-recommends nginx-light openssl ca-certificates; \
    fi; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_bundle \
    set -eu; \
    if [ -f /run/secrets/proxy_bundle ]; then \
      NODE_EXTRA_CA_CERTS=/run/secrets/proxy_bundle npm ci --omit=dev --ignore-scripts --strict-ssl=true; \
    else \
      npm ci --omit=dev --ignore-scripts --strict-ssl=true; \
    fi; \
    npm cache clean --force
COPY --chown=node:node server.js provider.js security.js contracts.js media.js ./
COPY --chown=node:node hosting/entrypoint.sh hosting/nginx.conf.template ./hosting/
USER node
EXPOSE 10000
CMD ["bash", "hosting/entrypoint.sh"]
