#!/usr/bin/env bash
# ollama_call.sh — call local Ollama with a prompt and print the response.
#
# Usage:
#   ollama_call.sh "your prompt"
#   echo "your prompt" | ollama_call.sh
#
# Env:
#   ROUTER_OLLAMA_MODEL  default: qwen2.5-coder:7b (Wave 2 Day 1; see ADR 017)
#   OLLAMA_HOST          default: http://localhost:11434
#
# Output: JSON with .response field, or plain text if --text passed.

set -euo pipefail

# Wave 19 (Day 4.1) — resolve this script's dir so we can locate token_tracker.js
# for the best-effort T0 usage record at the end.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Wave 2 Day 1: default swapped from qwen3:30b → qwen2.5-coder:7b.
# qwen3:30b is a reasoning MoE that emits long <thinking> chains and caused
# 2 timeouts + 149s mean latency on GENERAL in the Wave 1 benchmark
# (REPORT §4 #3). qwen2.5-coder:7b is code-specialised, ~3× faster, and
# already pulled in the canonical dev environment. Override via env var
# ROUTER_OLLAMA_MODEL or --model flag for tasks that genuinely need a
# heavier reasoner.
MODEL="${ROUTER_OLLAMA_MODEL:-qwen2.5-coder:7b}"
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

# Wave 19 (Day 4.1) — record REAL T0 tokens into the per-tier tracker so the 🪙
# chip + Stop report reflect local usage (local-summarizer / local-transformer
# spawn through THIS script, not providers/ollama-api.js). Fire-and-forget AFTER
# the response is already emitted: any failure is swallowed and never changes
# this call's output or exit code. Metadata only — no prompt/response text.
printf '%s' "$RESPONSE" | MODEL="$MODEL" TT_DIR="$SCRIPT_DIR" node -e "
  let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
    try {
      const j = JSON.parse(d);
      require(process.env.TT_DIR + '/token_tracker.js').trackCall(
        'T0', j.model || process.env.MODEL,
        Number(j.prompt_eval_count) || 0, Number(j.eval_count) || 0,
        { sessionId: process.env.CLAUDE_SESSION_ID }
      );
    } catch (_e) { /* tracker is best-effort */ }
  });
" 2>/dev/null || true
