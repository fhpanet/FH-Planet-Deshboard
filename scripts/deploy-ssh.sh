#!/bin/sh
# Rsync the public site to a No-IP / Oracle host. Never prints the key.
# SSH_PRIVATE_KEY may be a raw private key, or base64 (so GitLab can mask it).
set -eu
cd "$(dirname "$0")/.."
if [ -z "${SSH_PRIVATE_KEY:-}" ] || [ -z "${SSH_KNOWN_HOSTS:-}" ] || [ -z "${DEPLOY_USER:-}" ] || [ -z "${DEPLOY_HOST:-}" ] || [ -z "${DEPLOY_PATH:-}" ]; then
  echo "SSH_PRIVATE_KEY, SSH_KNOWN_HOSTS, DEPLOY_USER, DEPLOY_HOST, and DEPLOY_PATH are required."
  exit 1
fi
case "$DEPLOY_PATH" in
  /*) ;;
  *) echo "DEPLOY_PATH must be an absolute path."; exit 1 ;;
esac
sh scripts/stage-public.sh
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
key_file="$HOME/.ssh/id_deploy"
if printf '%s' "$SSH_PRIVATE_KEY" | grep -q 'BEGIN '; then
  printf '%s\n' "$SSH_PRIVATE_KEY" > "$key_file"
else
  printf '%s' "$SSH_PRIVATE_KEY" | tr -d ' \n' | base64 -d > "$key_file"
fi
chmod 600 "$key_file"
printf '%s\n' "$SSH_KNOWN_HOSTS" > "$HOME/.ssh/known_hosts"
chmod 600 "$HOME/.ssh/known_hosts"
# Excludes protect server-only files that share the directory. Do not use --delete-excluded.
rsync -az --delete \
  --exclude 'app.py' \
  --exclude 'fhplanet-reports.service' \
  --exclude '.git/' \
  --exclude '.github/' \
  --exclude '.gitlab-ci.yml' \
  --exclude 'data/' \
  --exclude '*.db' \
  --exclude '.env' \
  --exclude 'venv/' \
  --exclude '.venv/' \
  --exclude '__pycache__/' \
  -e "ssh -i $key_file -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes" \
  dist/ "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/"
rm -f "$key_file"
echo "Synced public site to ${DEPLOY_HOST}:${DEPLOY_PATH}"
