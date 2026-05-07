# Loophole catalogue — Mooter routing validation 2026-05-07

**Findings: 14** (S0:3 S1:9 S2:2)

Heuristics evaluated: 8 from master prompt + 3 bonus observations from runtime.

## [S1] H3_no_fallback_when_anthropic_degraded

**Anthropic provider is "degraded" but classifier offers only [sonnet] with no fallback.**

- **Prompt:** `prompt-016` — _investigate the race condition in websocket reconnect_
- **Classifier output:** `{"suggested_providers":["sonnet"]}`
- **Suggested fix:** When provider state is degraded/down, prepend a non-Anthropic alternative (codex_cli or ollama) to suggested_providers.

## [S1] H4_paid_low_quality

**Paid claude-opus-4-6 call for T2 prompt scored 32/100 — money for a poor answer.**

- **Prompt:** `prompt-019` — __
- **Cost:** $0.0039
- **Quality score:** 32/100
- **Judge verdict:** Addresses the missing code issue but misinterprets the prompt's cost concern and provides unnecessary meta-commentary about model selection.
- **Suggested fix:** Inspect prompt — is the classifier picking the wrong model class, or is the prompt itself ambiguous? Consider adding to validation-set as adversarial.

## [S1] H4_paid_low_quality

**Paid claude-opus-4-6 call for T3 prompt scored 35/100 — money for a poor answer.**

- **Prompt:** `prompt-024` — __
- **Cost:** $0.0082
- **Quality score:** 35/100
- **Judge verdict:** Misunderstands the prompt; user likely asked to use Opus for quick analysis of something unspecified, but response focuses on explaining Opus availability rather than asking for clarification in a concise way.
- **Suggested fix:** Inspect prompt — is the classifier picking the wrong model class, or is the prompt itself ambiguous? Consider adding to validation-set as adversarial.

## [S1] H4_paid_low_quality

**Paid claude-opus-4-6 call for T3 prompt scored 35/100 — money for a poor answer.**

- **Prompt:** `prompt-027` — __
- **Cost:** $0.0129
- **Quality score:** 35/100
- **Judge verdict:** Response uses outdated model name (Sonnet instead of Opus), provides generic templates rather than addressing the actual request, and contains incomplete code examples.
- **Suggested fix:** Inspect prompt — is the classifier picking the wrong model class, or is the prompt itself ambiguous? Consider adding to validation-set as adversarial.

## [S1] H4_paid_low_quality

**Paid claude-sonnet-4-6 call for T2 prompt scored 45/100 — money for a poor answer.**

- **Prompt:** `prompt-020` — __
- **Cost:** $0.0078
- **Quality score:** 45/100
- **Judge verdict:** Response is incomplete (cut off mid-table), lacks final recommendation despite prompt asking to choose one approach, but shows solid comparative structure.
- **Suggested fix:** Inspect prompt — is the classifier picking the wrong model class, or is the prompt itself ambiguous? Consider adding to validation-set as adversarial.

## [S1] H4_paid_low_quality

**Paid claude-haiku-4-5-20251001 call for T3 prompt scored 25/100 — money for a poor answer.**

- **Prompt:** `prompt-046` — __
- **Cost:** $0.0012
- **Quality score:** 25/100
- **Judge verdict:** Prompt is incomplete/cut off, response pretends to read files it cannot access and asks for clarification instead of operating autonomously as requested.
- **Suggested fix:** Inspect prompt — is the classifier picking the wrong model class, or is the prompt itself ambiguous? Consider adding to validation-set as adversarial.

## [S1] H4_paid_low_quality

**Paid anthropic:opus-4.6 call for T2 prompt scored 45/100 — money for a poor answer.**

- **Prompt:** `prompt-053` — __
- **Cost:** $0.0129
- **Quality score:** 45/100
- **Judge verdict:** Response identifies real causes (proxy timeouts) but is incomplete, cuts off mid-explanation, lacks client-side investigation, and doesn't provide actionable debugging steps.
- **Suggested fix:** Inspect prompt — is the classifier picking the wrong model class, or is the prompt itself ambiguous? Consider adding to validation-set as adversarial.

## [S1] BONUS_ollama_wrapper_broken_model_flag

**ollama_call.sh:40-48 builds the JSON payload via inline `node -e` but $MODEL is shell-local and never exported. Inline node sees process.env.MODEL undefined → payload has model:"" → server replies {"error":"model '' not found"}.**

- **Evidence:** tools/router/ollama_call.sh:40 — `PAYLOAD=$(node -e "..." "$PROMPT")` without `MODEL=$MODEL` prefix on the spawn.
- **Suggested fix:** Replace with `PAYLOAD=$(MODEL="$MODEL" node -e "..." "$PROMPT")` or `export MODEL` before the call. Repro: `bash tools/router/ollama_call.sh --model qwen2.5:3b "ping"`.

## [S1] BONUS_openai_api_key_malformed

**tools/router/.env contains an OPENAI_API_KEY with duplicated `sk-` prefix (`sk-sk-proj-...`), making every direct OpenAI call return 401 invalid_api_key. Discovered when sanity-pinging the API before Task #4.**

- **Evidence:** Direct fetch returned `{"type":"invalid_request_error","code":"invalid_api_key","message":"Incorrect API key provided: sk-sk-pr***...AAcA"}` — the key in .env literally starts with `sk-sk-proj-`.
- **Suggested fix:** Edit tools/router/.env: strip the leading `sk-` (one of two) so the key is `sk-proj-...` again.

## [S2] H8_overrouting_cheaper_better

**On prompt-053, cheaper model ollama:qwen2.5:3b (score=45, $0.0000) matched or beat opus (score=45, $0.0129).**

- **Prompt:** `prompt-053` — __
- **Ranking:** anthropic:haiku-4.5=72, anthropic:sonnet-4.6=72, ollama:qwen2.5:3b=45, anthropic:opus-4.6=45
- **Suggested fix:** Re-evaluate ARCH_SIGNALS / quality_intent boost rules — they may be over-promoting to T3 for prompts where cheaper tiers handle equally well.

## [S2] BONUS_classify_module_side_effect

**classify.js executes an async IIFE on module load (lines 1228-1242), causing every `require()` to attempt reading stdin and printing classification of an empty prompt to stdout. Found during Task #3 runner output.**

- **Evidence:** tools/router/classify.js:1228-1242 — IIFE not guarded by `if (require.main === module)`.
- **Suggested fix:** Wrap the IIFE in `if (require.main === module) { ... }` so the side effect only runs on direct CLI invocation.

## [S0] H1_high_confidence_false_positive

**Classifier said tier=T1 with 85% confidence but ground truth was T0.**

- **Prompt:** `prompt-005` — _rename variable userId to accountId in auth.ts_
- **Classifier output:** `{"tier":"T1","confidence":0.85,"escalation":"none"}`
- **Expected:** T0
- **Suggested fix:** Tighten the regex/category that fired for this prompt — add discriminator pattern; lower confidence for ambiguous cases.

## [S0] H1_high_confidence_false_positive

**Classifier said tier=T1 with 85% confidence but ground truth was T0.**

- **Prompt:** `prompt-056` — _rename the variable counter to attemptCount in retry.ts_
- **Classifier output:** `{"tier":"T1","confidence":0.85,"escalation":"none"}`
- **Expected:** T0
- **Suggested fix:** Tighten the regex/category that fired for this prompt — add discriminator pattern; lower confidence for ambiguous cases.

## [S0] H1_high_confidence_false_positive

**Classifier said tier=T1 with 85% confidence but ground truth was T0.**

- **Prompt:** `prompt-060` — _format this JSON file with 2-space indentation_
- **Classifier output:** `{"tier":"T1","confidence":0.85,"escalation":"none"}`
- **Expected:** T0
- **Suggested fix:** Tighten the regex/category that fired for this prompt — add discriminator pattern; lower confidence for ambiguous cases.
