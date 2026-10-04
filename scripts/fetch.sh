#!/bin/bash
# Fetch keri.foundation production content into the local WordPress mirror.
# Run from anywhere: bash scripts/fetch.sh
# Destination is this repository (the kerifoundation checkout).

# Updated: 2026-04-12: Digistate -> Hostinger

set -e  # Exit on error

echo "⚡ Fetch remote..."

# This script downloads (fetches) the live site content from the remote server
# rather than uploading local files there. It's intended for pulling the current
# production content into the local WordPress mirror for development or backups.
echo "📥 Fetching from remote server..."

# SSH options come from ~/.ssh/config. We exclude
# local config files from overwrite by default and include a dry-run mode.
# Toggle DRY_RUN=1 to test without writing:
DRY_RUN=${DRY_RUN:-0}

# Exclude critical local config files to avoid overwriting local settings
EXCLUDES=(--exclude 'wp-config.php' --exclude '.env' --exclude '.git' --exclude 'deploy-custom-css.sh')

# Remote and local paths
REMOTE_USER_HOST="REDACTED@REDACTED"
REMOTE_PATH="/home/REDACTED/domains/keri.foundation/public_html/"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"

# RSYNC_OPTS=(-vurt --delete --timeout=30 -e "ssh -o ConnectTimeout=10")
RSYNC_OPTS=(-vurt --timeout=30 -e "ssh -o ConnectTimeout=10")

if [ ! -d "$LOCAL_PATH" ]; then
	echo "❌ Local mirror not found: $LOCAL_PATH"
	exit 1
fi

if [ "$DRY_RUN" = "1" ]; then
	echo "⚠️  Dry-run enabled: no files will be changed. To perform the fetch set DRY_RUN=0 and re-run."
	rsync "${RSYNC_OPTS[@]}" --dry-run "${EXCLUDES[@]}" "${REMOTE_USER_HOST}:${REMOTE_PATH}" "$LOCAL_PATH"
else
	echo "🔄 Downloading files from: ${REMOTE_USER_HOST}:${REMOTE_PATH}"
	echo "   → $LOCAL_PATH"
	rsync "${RSYNC_OPTS[@]}" "${EXCLUDES[@]}" "${REMOTE_USER_HOST}:${REMOTE_PATH}" "$LOCAL_PATH"
	echo "✅ Fetch completed successfully!"
fi
