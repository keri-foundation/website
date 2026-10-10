#!/bin/bash
# KERI Foundation - Upload custom/ to the live site
# Run from anywhere: bash scripts/deploy-custom-code.sh

set -e  # Exit on error

echo "⚡ Uploading custom CSS and JS..."

# Repository root (this script lives in scripts/)
cd "$(dirname "$0")/.."

echo "🚀 Deploying to remote server..."
# Use port 65002 and set short timeouts (allow password prompts)
rsync -vurt --delete --timeout=30 -e "ssh -p 65002 -o ConnectTimeout=10" \
	custom/ \
	u465541917@92.113.19.27:/home/u465541917/domains/keri.foundation/public_html/custom/

echo "✅ Deployment completed successfully!"
