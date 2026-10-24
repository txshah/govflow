#!/usr/bin/env bash
# Runs the GovFlow web app on a Runpod CPU pod: clones the public repo, writes the demo logins from
# env vars (set them from Runpod secrets, never in the repo), builds, and serves on port 3100.
#
# Inputs (env): DEMO_TOKENS_JSON, DEMO_OBSERVER_JSON (contents of seed/.demo-tokens.json / .demo-observer.json),
#               GOVFLOW_REF (branch, default main)
# Outputs: the site on 0.0.0.0:3100, reachable at https://<pod-id>-3100.proxy.runpod.net
set -euo pipefail

rm -rf /app
git clone --depth 1 --branch "${GOVFLOW_REF:-main}" https://github.com/txshah/govflow /app
mkdir -p /app/seed
if [ -n "${DEMO_TOKENS_JSON:-}" ]; then printf '%s' "$DEMO_TOKENS_JSON" > /app/seed/.demo-tokens.json; fi
if [ -n "${DEMO_OBSERVER_JSON:-}" ]; then printf '%s' "$DEMO_OBSERVER_JSON" > /app/seed/.demo-observer.json; fi
chmod 600 /app/seed/.demo-*.json 2>/dev/null || true

cd /app/web
npm ci --no-audit --no-fund
npx next build
exec npx next start -p 3100 -H 0.0.0.0
