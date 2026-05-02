#!/usr/bin/env bash
# Remote access without VPS or VPN: expose local Junction dashboard via Cloudflare Tunnel.
# Prereqs: `brew install cloudflare/cloudflare/cloudflared` (or download from Cloudflare),
#          run `cloudflared tunnel login` once, `npm run build && npm run start:public` in another terminal.
set -euo pipefail
PORT="${PORT:-3000}"
ORIGIN="http://127.0.0.1:${PORT}"
echo "Starting quick tunnel to ${ORIGIN} (ephemeral URL; use 'cloudflared tunnel create' for a fixed hostname)."
exec cloudflared tunnel --url "${ORIGIN}"
