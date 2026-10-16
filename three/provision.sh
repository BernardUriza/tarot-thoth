#!/usr/bin/env bash
# One-time Azure provisioning for the Tarot Thoth page: Static Web App tarot-thoth (Free) in portfolio-rg
# next to the portfolio, its deployment token into ~/.secrets, and the custom domain tarot.bernarduriza.com.
# DNS (Namecheap): CNAME tarot -> <defaultHostname> must exist before the hostname step validates.
#   bash three/provision.sh
set -euo pipefail
APP=tarot-thoth
RG=portfolio-rg
DOMAIN=tarot.bernarduriza.com
TOKEN_FILE=~/.secrets/azure-swa-tarot-thoth.txt

if ! az staticwebapp show -n "$APP" -g "$RG" --query name -o tsv >/dev/null 2>&1; then
  az staticwebapp create -n "$APP" -g "$RG" -l eastus2 --sku Free --output none
  echo "created $APP"
fi
HOST=$(az staticwebapp show -n "$APP" -g "$RG" --query defaultHostname -o tsv)
echo "default host: $HOST  (Namecheap: CNAME tarot -> $HOST)"

TOKEN=$(az staticwebapp secrets list -n "$APP" -g "$RG" --query properties.apiKey -o tsv)
printf '# Azure Static Web App deployment token for tarot-thoth (tarot.bernarduriza.com). Used by three/deploy.sh. Created 2026-10-16.\nAZURE_STATIC_WEB_APPS_API_TOKEN=%s\n' "$TOKEN" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"; echo "token saved to $TOKEN_FILE (${#TOKEN} chars)"

if ! az staticwebapp hostname list -n "$APP" -g "$RG" --query "[?name=='$DOMAIN'].name" -o tsv | grep -q .; then
  if dig +short CNAME "$DOMAIN" @8.8.8.8 | grep -q "$HOST"; then
    az staticwebapp hostname set -n "$APP" -g "$RG" --hostname "$DOMAIN" --output none && echo "hostname $DOMAIN added"
  else
    echo "DNS not propagated yet: add CNAME tarot -> $HOST in Namecheap, then re-run"
  fi
fi
az staticwebapp hostname list -n "$APP" -g "$RG" -o table
