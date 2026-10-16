#!/usr/bin/env bash
# Deploy three/ (the page plus the locally built thoth/ corpus, which is gitignored) to the tarot-thoth
# Static Web App. Runs from this Mac on purpose: the corpus never goes through git or CI.
#   bash three/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f three/thoth/deck.json ] && [ -f three/thoth/chunks.json ] || { echo "three/thoth/ corpus missing: python3 rag/build_thoth.py first" >&2; exit 1; }
TOKEN=$(grep -m1 '^AZURE_STATIC_WEB_APPS_API_TOKEN=' ~/.secrets/azure-swa-tarot-thoth.txt | cut -d= -f2-)
[ -n "$TOKEN" ] || { echo "no deployment token: run three/provision.sh" >&2; exit 1; }
npx --yes @azure/static-web-apps-cli@2 deploy ./three --env production --deployment-token "$TOKEN" --no-use-keychain
echo "deployed: https://tarot.bernarduriza.com"
