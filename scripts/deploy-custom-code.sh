#!/bin/bash
# KERI Foundation - Upload custom/ to the live site
# Run from anywhere: bash scripts/deploy-custom-code.sh

set -euo pipefail

echo "⚡ Uploading custom CSS and JS..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

REMOTE_HOST="${REMOTE_HOST:-kerifoundation}"
REMOTE_ROOT="${REMOTE_ROOT:-domains/keri.foundation/public_html}"

echo "🚀 Deploying to remote server..."
rsync -vurt --delete --timeout=30 -e "ssh -o ConnectTimeout=10" \
	custom/ \
	"${REMOTE_HOST}:${REMOTE_ROOT}/custom/"

echo "✅ Deployment completed successfully!"
