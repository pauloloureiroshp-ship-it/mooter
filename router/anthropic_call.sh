#!/usr/bin/env bash
# anthropic_call.sh — call Anthropic Messages API with a cheap model.
#
# Usage:
#   anthropic_call.sh "your prompt"
#   echo "your prompt" | anthropic_call.sh
#   anthropic_call.sh --model claude-sonnet-4-6 "..."
#
# Env:
#   ANTHROPIC_API_KEY    REQUIRED — exits 4 if absent
#   ROUTER_ANTHROPIC_MODEL default: claude-haiku-4-5-20251001
#
# Output: JSON Anthropic response, or plain text with --text.

set -euo pipefail

MODEL="${ROUTER_ANTHROPIC_MODEL:-claude-haiku-4-5-20251001}"
TEXT_ONLY=0
MAX_TOKENS=1024

while [ "$#" -gt 0 ]; do
  case "$1" in
    --text) TEXT_ONLY=1; shift ;;
    --model) MODEL="$2"; shift 2 ;;
    --max-tokens) MAX_TOKENS="$2"; shift 2 ;;
    *) break ;;
  esac
done

PROMPT="${*:-}"
if [ -z "$PROMPT" ] && [ ! -t 0 ]; then
  PROMPT="$(cat)"
fi

if [ -z "$PROMPT" ]; then
  echo "anthropic_call.sh: empty prompt" >&2
  exit 2
fi

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "anthropic_call.sh: ANTHROPIC_API_KEY not set — cannot call API" >&2
  exit 4
fi

PAYLOAD=$(node -e "
  process.stdout.write(JSON.stringify({
    model: process.env.MODEL,
    max_tokens: parseInt(process.env.MAX_TOKENS, 10),
    messages: [{ role: 'user', content: process.argv[1] }]
  }));
" "$PROMPT")

RESPONSE=$(MODEL="$MODEL" MAX_TOKENS="$MAX_TOKENS" \
  curl -sS -X POST https://api.anthropic.com/v1/messages \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d "$PAYLOAD" \
    --max-time 60)

if [ "$TEXT_ONLY" = "1" ]; then
  printf '%s' "$RESPONSE" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
      try {
        const j = JSON.parse(d);
        const txt = (j.content || []).map(b => b.text || '').join('');
        process.stdout.write(txt);
      } catch(e){ process.stderr.write('parse error: '+e.message+'\n'); process.exit(3); }
    });
  "
else
  printf '%s\n' "$RESPONSE"
fi
