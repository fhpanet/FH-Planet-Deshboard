#!/bin/sh
# Build ./dist for public hosting. Server-only files stay out of the publish set.
set -eu
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist
tar \
  --exclude='./dist' \
  --exclude='./.git' \
  --exclude='./.github' \
  --exclude='./.gitlab-ci.yml' \
  --exclude='./app.py' \
  --exclude='./fhplanet-reports.service' \
  --exclude='./.env' \
  --exclude='./data' \
  -cf - . | (cd dist && tar -xf -)
test -f dist/index.html
test -f dist/dash.html
test -f dist/finance/index.html
test -f dist/finance/css/app.css
test -f dist/finance/js/app.js
test -f dist/finance/js/store.js
test -f dist/finance/js/sms.js
test -f dist/_headers
grep -q "FH Planet Modules" dist/index.html
grep -q "টড়ো" dist/index.html
test ! -f dist/app.py
test ! -f dist/fhplanet-reports.service
test ! -d dist/.git
test ! -d dist/.github
test ! -f dist/.gitlab-ci.yml
echo "Public site staged in dist/"
