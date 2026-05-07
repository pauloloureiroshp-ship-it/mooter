#!/usr/bin/env bash
# ollama_call.sh — call local Ollama with a prompt and print the response.
#
# Usage:
#   ollama_call.sh "your prompt"
#   echo "your prompt" | ollama_call.sh
#
# Env:
#   ROUTER_OLLAMA_MODEL  default: qwen3:30b
#   OLLAMA_HOST          default: http://localhost:11434
#
# Output: JSON with .response field, or plain text if --text passed.

set -euo pipefail

MODEL="${ROUTER_OLLAMA_MODEL:-qwen3:30b}"
HOST="${OLLAMA_HOST:-http://localhost:11434}"
TEXT_ONLY=0

# Parse flags
while [ $# -gt 0 ]; do
  case "$1" in
    --text)   TEXT_ONLY=1; shift ;;
    --model)  MODEL="$2"; shift 2 ;;
    *)        break ;;
  esac
done

PROMPT="${*:-}"
if [ -z "$PROMPT" ] && [ ! -t 0 ]; then
  PROMPT="$(cat)"
fi

if [ -z "$PROMPT" ]; then
  echo "ollama_call.sh: empty prompt" >&2
  exit 2
fi

# /api/generate is non-streaming by default when stream=false.
# MODEL must be passed explicitly to the inline node — it is shell-local,
# not exported. Without this prefix, process.env.MODEL is undefined and
# the payload ships {"model":""} which Ollama rejects.
PAYLOAD=$(MODEL="$MODEL" node -e "
  const p = process.argv[1];
  process.stdout.write(JSON.stringify({
    model: process.env.MODEL,
    prompt: p,
    stream: false,
    options: { temperature: 0.2, num_predict: 512 }
  }));
" "$PROMPT")

RESPONSE=$(curl -sS -X POST "$HOST/api/generate" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" \
  --max-time 120)

if [ "$TEXT_ONLY" = "1" ]; then
  printf '%s' "$RESPONSE" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
      try { process.stdout.write(JSON.parse(d).response || ''); }
      catch(e){ process.stderr.write('parse error: '+e.message+'\n'); process.exit(3); }
    });
  "
else
  printf '%s\n' "$RESPONSE"
fi
