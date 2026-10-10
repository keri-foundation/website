#!/bin/bash
# KERI Foundation - Upload custom/ to the live site
# Run from anywhere: bash scripts/deploy-custom-code.sh

set -e  # Exit on error

echo "⚡ Uploading custom CSS and JS..."

# Repository root (this script lives in scripts/)
cd "$(dirname "$0")/.."

echo "🚀 Deploying to remote server..."
# SSH options come from ~/.ssh/config
rsync -vurt --delete --timeout=30 -e "ssh -o ConnectTimeout=10" \
	custom/ \
	REDACTED@REDACTED:/home/REDACTED/domains/keri.foundation/public_html/custom/

echo "✅ Deployment completed successfully!"
