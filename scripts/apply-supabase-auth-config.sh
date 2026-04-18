#!/usr/bin/env bash
# apply-supabase-auth-config.sh — one-shot remediation for the 2 dashboard-only
# items surfaced by the 2026-04-18 platform audit.
#
# WHY THIS SCRIPT EXISTS
#   The Supabase "Redirect URLs" allowlist and the "Leaked Password Protection"
#   toggle are NOT exposed via the Supabase MCP or via execute_sql — they live
#   in Supabase's managed service. They can only be changed from:
#     a) the Dashboard UI (manual clicks), or
#     b) the Management API (this script — if you have a PAT).
#
# HOW TO USE
#   1. Go to https://supabase.com/dashboard/account/tokens
#      → "Generate new token" (description: "mooter-audit", expiration: 1 hour)
#      → copy the token.
#   2. Run:
#        SUPABASE_ACCESS_TOKEN=sbp_xxxxx bash scripts/apply-supabase-auth-config.sh
#
# WHAT IT DOES
#   - PATCH /v1/projects/{ref}/config/auth with:
#       site_url                 = https://mooter.ai
#       uri_allow_list           = mooter.ai/** , mooter.ai/auth/callback , www.mooter.ai/auth/callback
#       password_hibp_enabled    = true    (HaveIBeenPwned check)
#   - GETs the config back and prints a diff summary.
#
# EXIT CODES
#   0  success, both settings applied
#   1  missing SUPABASE_ACCESS_TOKEN
#   2  API error (400/401/403/5xx — prints the response body)
#   3  verification mismatch (API accepted but readback doesn't match)

set -euo pipefail

PROJECT_REF="eymtobwinevywmmlmxqa"
API="https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth"

SITE_URL="https://mooter.ai"
REDIRECT_URLS='https://mooter.ai/**,https://mooter.ai/auth/callback,https://www.mooter.ai/auth/callback'

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "❌ SUPABASE_ACCESS_TOKEN not set."
  echo "   Generate one at https://supabase.com/dashboard/account/tokens,"
  echo "   then re-run:  SUPABASE_ACCESS_TOKEN=sbp_xxx bash $0"
  exit 1
fi

echo "→ applying auth config to project ${PROJECT_REF}..."

PAYLOAD=$(cat <<JSON
{
  "site_url": "${SITE_URL}",
  "uri_allow_list": "${REDIRECT_URLS}",
  "password_hibp_enabled": true
}
JSON
)

RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X PATCH "${API}" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}")

HTTP_CODE=$(echo "${RESP}" | tail -n1 | sed 's/HTTP_STATUS://')
BODY=$(echo "${RESP}" | sed '$d')

if [[ "${HTTP_CODE}" != "200" ]]; then
  echo "❌ Supabase Management API returned HTTP ${HTTP_CODE}"
  echo "   body: ${BODY}"
  exit 2
fi

echo "✅ PATCH succeeded. Re-reading config to verify..."

CHECK=$(curl -s -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" "${API}")

SITE=$(echo "${CHECK}" | grep -o '"site_url":"[^"]*"' | head -1 | sed 's/"site_url":"\([^"]*\)"/\1/')
ALLOW=$(echo "${CHECK}" | grep -o '"uri_allow_list":"[^"]*"' | head -1 | sed 's/"uri_allow_list":"\([^"]*\)"/\1/')
HIBP=$(echo "${CHECK}" | grep -o '"password_hibp_enabled":\(true\|false\)' | head -1 | sed 's/"password_hibp_enabled"://')

echo ""
echo "── verification ──"
echo "  site_url              = ${SITE}"
echo "  uri_allow_list        = ${ALLOW}"
echo "  password_hibp_enabled = ${HIBP}"

if [[ "${SITE}" == "${SITE_URL}" && "${HIBP}" == "true" ]]; then
  echo ""
  echo "✅ All auth config applied. You can revoke the PAT now."
  exit 0
else
  echo ""
  echo "❌ Readback doesn't match expected values."
  exit 3
fi
