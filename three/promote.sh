#!/usr/bin/env bash
# Put Tarot Thoth on bernarduriza.com. The portfolio only lists projects that portfolio-spring curated from a
# public repo starred by BernardUriza, so: star the repo, run the sync, then pin description + live link.
#   bash three/promote.sh
set -euo pipefail
API=https://portfolio-spring.mangobush-0b255aa4.eastus2.azurecontainerapps.io
REPO=BernardUriza/tarot-thoth
LIVE=https://tarot.bernarduriza.com
DESCRIPTION="Three-card Thoth tarot reading in the browser, grounded in Crowley's The Book of Thoth instead of a prompt: the book is segmented by its own card sections, retrieved in the browser (MiniSearch), and the drawn passages are carried to a Claude persona on AIRE that streams the reading as it is written. Elemental dignities instead of reversals, three.js deck, voice in and out through susurro."

TOKEN=$(az containerapp show -n portfolio-spring -g portfolio-rg --query "properties.template.containers[0].env[?name=='PORTFOLIO_ADMIN_TOKEN'].value | [0]" -o tsv)
[ -n "$TOKEN" ] || { echo "no PORTFOLIO_ADMIN_TOKEN on the Container App" >&2; exit 1; }
auth=(-H "X-Admin-Token: $TOKEN" -H "Content-Type: application/json")

gh api -X PUT "/user/starred/$REPO" && echo "starred $REPO"

find_project() {
  curl -s --max-time 60 "$API/api/sync/projects" | python3 -c '
import json,sys
for p in json.load(sys.stdin):
    if "tarot-thoth" in (p.get("githubRepo") or ""): print(p["id"]); break'
}

ID=$(find_project)
if [ -z "$ID" ]; then
  echo "running sync (ingest + curation)…"
  curl -s --max-time 60 -X POST "$API/api/admin/sync-config/run-now" "${auth[@]}" -o /dev/null -w "run-now -> %{http_code}\n"
  for i in $(seq 1 40); do
    sleep 15
    running=$(curl -s --max-time 30 "$API/api/admin/sync-config/status" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("running"))')
    ID=$(find_project)
    echo "  $((i*15))s running=$running project=${ID:-none}"
    [ -n "$ID" ] && [ "$running" = "False" ] && break
  done
fi
[ -n "$ID" ] || { echo "the sync did not create the project; read GET $API/api/admin/sync/log" >&2; exit 1; }
echo "project id $ID"

body=$(python3 -c 'import json,sys; print(json.dumps({"description": sys.argv[1], "link": sys.argv[2]}))' "$DESCRIPTION" "$LIVE")
curl -s --max-time 60 -X PATCH "$API/api/admin/portfolio/$ID" "${auth[@]}" -d "$body" -o /dev/null -w "patch description+link -> %{http_code}\n"
curl -s --max-time 60 -X PATCH "$API/api/admin/portfolio/$ID/protection" "${auth[@]}" -d '{"protectDescription":true,"protectLiveDemoUrl":true,"protectSkills":false,"protectExperiences":false}' -o /dev/null -w "protection -> %{http_code}\n"
curl -s --max-time 60 -X PATCH "$API/api/admin/portfolio/$ID/completion-status" "${auth[@]}" -d '{"status":"LIVE"}' -o /dev/null -w "completion LIVE -> %{http_code}\n"
curl -s --max-time 60 -X PATCH "$API/api/admin/portfolio/$ID/priority" "${auth[@]}" -d '{"priority":"HIGH"}' -o /dev/null -w "priority HIGH -> %{http_code}\n"

curl -s --max-time 60 "$API/api/sync/projects" | python3 -c '
import json,sys
for p in json.load(sys.stdin):
    if "tarot-thoth" in (p.get("githubRepo") or ""):
        print("live entry:", p["title"], "|", p["link"], "|", p["completionStatus"], "|", p["mainTechnologies"])'
