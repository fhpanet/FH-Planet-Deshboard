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
test -f dist/assets/nav.js
test -f dist/assets/nav.css
test -f dist/assets/hub.css
test -f dist/assets/windows.js
test -f dist/assets/windows.css
test -f dist/assets/command.js
test -f dist/assets/command.css
grep -q "FH_PLANET_NAV" dist/assets/nav.js
grep -q "FH_PLANET_COMMAND" dist/assets/command.js
grep -q "FHPlanetShell" dist/assets/windows.js
grep -q "fh-side-toggle" dist/assets/nav.js
grep -q "assets/command.js" dist/index.html
grep -q "assets/command.js" dist/dash.html
grep -q "assets/command.js" dist/finance/index.html
grep -q "view-planning" dist/assets/nav.js
grep -q "FHFinance" dist/finance/js/app.js
grep -q "fh-finance" dist/finance/css/app.css
grep -q "id=\"view-planning\"" dist/index.html
grep -q "id=\"view-todo\"" dist/index.html
grep -q "FH_PLANET_NAV" dist/assets/nav.js
grep -q "assets/nav.js" dist/index.html
grep -q "assets/nav.js" dist/finance/index.html
grep -q "assets/nav.js" dist/dash.html
grep -q "id=\"view-todo\"" dist/index.html
grep -q "FH Planet Modules" dist/index.html
grep -q "টড়ো" dist/index.html
test ! -f dist/app.py
test ! -f dist/fhplanet-reports.service
test ! -d dist/.git
test ! -d dist/.github
test ! -f dist/.gitlab-ci.yml
echo "Public site staged in dist/"
