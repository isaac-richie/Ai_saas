#!/usr/bin/env bash
# Sets up the Motion Ad render worker on a fresh Ubuntu 22.04/24.04 server and keeps it running.
# Copy the repo's motion-ads folder AND src/core/services/motion-ad (the shared storyboard rules the
# worker imports) to the server in the same layout as the repo, then run as root:
#   sudo bash motion-ads/deploy/setup.sh
# Safe to run again after copying a newer version of the folder: it reinstalls and restarts.
set -euo pipefail

BASE=/opt/visiowave
APP_DIR=$BASE/motion-ads
SHARED=src/core/services/motion-ad
ENV_FILE=/etc/motion-ad-worker.env
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$(id -u)" -ne 0 ]; then echo "Run this as root: sudo bash deploy/setup.sh"; exit 1; fi

echo "== System packages (Node 22 and the libraries headless Chrome needs)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl rsync
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
# Ubuntu 24.04 renamed libasound2 to libasound2t64; install whichever exists.
ASOUND=libasound2; apt-cache show libasound2t64 >/dev/null 2>&1 && ASOUND=libasound2t64
apt-get install -y libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 "$ASOUND" libxrandr2 \
  libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2 libcups2 fonts-liberation

echo "== 2 GB swap, so a memory spike during a render slows down instead of crashing"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== A user with no login for the worker to run as"
id motionads >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin motionads

echo "== Copying the worker to $APP_DIR (and the shared rules it imports)"
if [ ! -f "$SRC_DIR/../$SHARED/contract.ts" ]; then
  echo "Missing $SHARED next to motion-ads. Copy it to the server too (see the top of this file)."; exit 1
fi
mkdir -p "$APP_DIR" "$BASE/$SHARED"
rsync -a --delete --exclude node_modules --exclude out --exclude .env.local "$SRC_DIR"/ "$APP_DIR"/
rsync -a --delete "$SRC_DIR/../$SHARED"/ "$BASE/$SHARED"/
# The shared files import zod: let them find the worker's packages.
ln -sfn "$APP_DIR/node_modules" "$BASE/node_modules"
chown -R motionads:motionads "$BASE"
sudo -u motionads bash -c "cd $APP_DIR && npm ci --no-audit --no-fund"
# Download Remotion's own headless Chrome now, not during the first render.
sudo -u motionads bash -c "cd $APP_DIR && npx --no-install remotion browser ensure" || true

echo "== Keys"
if [ ! -s "$ENV_FILE" ] && [ ! -t 0 ]; then
  install -m 644 "$APP_DIR/deploy/motion-ad-worker.service" /etc/systemd/system/motion-ad-worker.service
  systemctl daemon-reload
  echo "Installed, but no keys yet. Log in and run:  bash $APP_DIR/deploy/setup.sh   (it asks for them)"
  exit 0
fi
if [ ! -s "$ENV_FILE" ]; then
  read -r -p "Supabase project URL (https://….supabase.co): " URL
  read -r -s -p "Supabase service role key (hidden): " KEY; echo
  umask 077
  printf 'NEXT_PUBLIC_SUPABASE_URL=%s\nSUPABASE_SERVICE_ROLE_KEY=%s\n' "$URL" "$KEY" > "$ENV_FILE"
fi
chown root:root "$ENV_FILE"; chmod 600 "$ENV_FILE"

echo "== Service: starts on boot and restarts if it stops"
install -m 644 "$APP_DIR/deploy/motion-ad-worker.service" /etc/systemd/system/motion-ad-worker.service
systemctl daemon-reload
systemctl enable motion-ad-worker >/dev/null
systemctl restart motion-ad-worker
sleep 3
systemctl --no-pager --lines=15 status motion-ad-worker || true
echo
echo "Done. Live log: journalctl -u motion-ad-worker -f"
