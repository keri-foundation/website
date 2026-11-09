#!/bin/bash
# Fetch keri.foundation WordPress production content into this checkout.
# Does not touch confs/ or vids/ (those use scripts/deploy-confs.sh).
# Run from anywhere: bash scripts/fetch-wordpress.sh

set -euo pipefail

echo "⚡ Fetch remote WordPress..."

# This script downloads (fetches) live WordPress site content from the remote
# server into the local checkout. It is an allowlist: only the paths below are
# transferred, so confs/, vids/, and other non-WordPress trees are skipped.
echo "📥 Fetching WordPress from remote server..."

# Toggle DRY_RUN=1 to test without writing:
DRY_RUN=${DRY_RUN:-0}

# Allowlist of WordPress paths under public_html/. First matching rule wins;
# a final --exclude='*' drops everything else (confs/, vids/, etc.).
# Protect local secrets before the broad /*.php include.
FILTERS=(
	--exclude='/wp-config.php'
	--exclude='/.env'
	--exclude='/.git'
	--exclude='/.git/***'
	--exclude='/deploy-custom-css.sh'
	--include='/wp-admin/'
	--include='/wp-admin/***'
	--include='/wp-content/'
	--include='/wp-content/***'
	--include='/wp-includes/'
	--include='/wp-includes/***'
	--include='/custom/'
	--include='/custom/***'
	--include='/*.php'
	--include='/.htaccess'
	--include='/license.txt'
	--include='/readme.html'
	--exclude='*'
)

# SSH host alias (user/host/port live in ~/.ssh/config). Path is relative to home.
REMOTE_HOST="${REMOTE_HOST:-kerifoundation}"
REMOTE_ROOT="${REMOTE_ROOT:-domains/keri.foundation/public_html}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"

RSYNC_OPTS=(-vurt --timeout=30 -e "ssh -o ConnectTimeout=10")

if [ ! -d "$LOCAL_PATH" ]; then
	echo "❌ Local mirror not found: $LOCAL_PATH"
	exit 1
fi

if [ "$DRY_RUN" = "1" ]; then
	echo "⚠️  Dry-run enabled: no files will be changed. To perform the fetch set DRY_RUN=0 and re-run."
	rsync "${RSYNC_OPTS[@]}" --dry-run "${FILTERS[@]}" "${REMOTE_HOST}:${REMOTE_ROOT}/" "$LOCAL_PATH"
else
	echo "🔄 Downloading WordPress files from: ${REMOTE_HOST}:${REMOTE_ROOT}/"
	echo "   → $LOCAL_PATH"
	echo "   (allowlist: wp-admin, wp-content, wp-includes, custom, root WP files; skips confs/ & vids/)"
	rsync "${RSYNC_OPTS[@]}" "${FILTERS[@]}" "${REMOTE_HOST}:${REMOTE_ROOT}/" "$LOCAL_PATH"
	echo "✅ WordPress fetch completed successfully!"
fi
