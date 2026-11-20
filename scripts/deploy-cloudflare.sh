#!/bin/sh
# Publish ./dist to Cloudflare Pages. Tokens come from the CI environment only.
set -eu
cd "$(dirname "$0")/.."
sh scripts/stage-public.sh
project="${CF_PAGES_PROJECT:-fh-planet-dashboard}"
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required."
  exit 1
fi
npx --yes wrangler@4 pages deploy dist --project-name "$project" --commit-dirty=true
