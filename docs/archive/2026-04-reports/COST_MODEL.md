# Cost model — how frugal measures savings

> **TL;DR** — In v0.6, frugal dropped its flat-per-tier cost fiction and
> adopted a token-estimated model anchored to real Anthropic pricing.
> The savings numbers in your statusline are now honest *estimates*, not
> fabrications. This doc explains what we measure, what we don't, and
> why the two numbers you see (`advisory` vs `guaranteed`) are not the
> same thing.

---

## The problem we inherited

Up to v0.5, `savings-tracker.js` used a flat cost per tier:

```js
T0 = $0.000    T1 = $0.0008    T2 = $0.008    T3 = $0.045
```

These numbers were ~25–60× under real Anthropic prices. A real Opus 4.6
turn on a 10k-char prompt with a populated session context costs
**~$1.20**, not $0.045. The v0.5 tracker therefore told you that you
had "saved 90.2%" on a corpus that, measured honestly, might have saved
a lot more — or a lot less — depending on *real* usage.

The kicker: the tracker counted T0 prompts as `$0.000`, but in most
cases the Opus session *still processed the turn* (it just chose to
spawn a local-summarizer or respond inline). T0 is only **really** free
when Option A fires: the Ollama answer is inlined into the hook and
Opus regurgitates it verbatim. Every other T0 classification was a
hopeful estimate, not a measured saving.

## What v0.6 measures

### 1. `real_cost_estimated` — token-based estimate per prompt

We use `pricing.js` as the single source of truth for model prices:

```js
'claude-opus-4-6':     { input: 15.0,  output: 75.0  },  // per MTok
'claude-opus-4-6[1m]': { input: 30.0,  output: 150.0 },  // >200k ctx
'claude-sonnet-4-6':   { input:  3.0,  output: 15.0  },
'claude-haiku-4-5':    { input:  0.80, output:  4.0  },
'qwen2.5:3b':          { input: 0,     output: 0     },
```

For each classified prompt in `decisions.log` we compute:

```
input_tokens  = SESSION_CONTEXT_BASE (8000) + prompt_len / 3.5
output_tokens = AVG_OUTPUT_TOK[tier]   // 200/350/900/1800
cost          = priceTurn(tier_model, input_tokens, output_tokens)
```

Sum across the corpus = `real_cost_estimated`.

> **Caveat on `SESSION_CONTEXT_BASE_TOKENS = 8000`** — this represents
> the system prompt + tools schema + short conversation history weight
> that is added on every turn. 8 000 is conservative; a real Claude
> Code session with 3+ MCP servers and a long CLAUDE.md often sits at
> 12 000–18 000 base tokens, sometimes higher. The estimate therefore
> *under-states* real cost on rich sessions. If you want a tighter
> number for your specific setup, edit the constant in `pricing.js` —
> the entire pipeline reads it from there. A future v0.7 invocation
> telemetry hook will replace this constant with measured per-turn
> token counts from the Anthropic API response metadata.

### 2. `naive_cost` — honest Opus baseline

"What would this prompt have cost if Opus 4.6 had processed the turn
with the full session context?" → `naiveOpusCost(prompt_len)` in
pricing.js. Sum across the corpus = `naive_cost`.

This is the honest answer to "how much did not having a router cost?"
It's still an estimate (we don't know the exact Opus output length for
every hypothetical), but it's within the right order of magnitude —
unlike the v0.5 flat $0.045.

### 3. `advisory_saved` — the approximation

```
advisory_saved = naive_cost - real_cost_estimated
```

This is what the statusline displays when `guaranteed_saved` is zero.
It's useful as a *directional* indicator ("most of my prompts are
trivial, the router helps"), but it's not a cash figure you can book.

**Labelled with a tilde (`~$X.XX`) in the statusline to mark it as
estimated.**

### 4. `guaranteed_saved` — the only cash-accurate number

Every `option_a_hit` event in `decisions.log` is a prompt where the
Ollama-generated answer was injected via `<suggested_answer>` into the
hook output, and the Opus session output it verbatim. The Opus *tokens
used* for that turn were minimal (regurgitation, not reasoning).

```
guaranteed_saved = option_a_hits × (naive_cost / prompts)
```

This is the closest thing to a real savings number frugal can produce
without hooking into the actual Anthropic OAuth usage API. **When the
statusline shows a number with *no* tilde prefix, it's a guaranteed
save.**

## What v0.6 does NOT measure

These are known gaps, documented in `AUDIT.md` and tracked in
`ROADMAP.md` → v0.7:

1. **Sub-agent double-dipping.** When Opus spawns `model-reasoner`
   (Sonnet) or `local-summarizer` (Ollama), the Opus session still
   pays tokens to formulate the task and integrate the result. That
   round-trip cost is invisible.

2. **Real OAuth 5h usage.** `.budget-cache.json` is supposed to hold
   the live OAuth API reading. In production we found the bearer token
   can go stale silently — `inject_context.js` v0.6 now refuses to
   cache error responses and the new `/real` endpoint surfaces the
   error to the user with a `claude auth login` hint. But we still
   don't cross-reference those readings with `decisions.log` windows
   to compute true per-window cost.

3. **Actual invocation telemetry.** We log classifier *hints*, not
   model invocations. If Claude Code ignores the hint and processes
   the turn in Opus anyway, the log still says "Ollama". The only fix
   is a `PostToolUse` hook that reads `usage.input_tokens` /
   `usage.output_tokens` from the response metadata — scoped for v0.7.

4. **Non-Anthropic providers.** `pricing.js` has entries for Gemini
   Flash/Pro and GPT-4o/4o-mini in anticipation of v0.7 multi-provider
   support, but today the classifier only emits Anthropic + Ollama,
   so those rows never fire.

## Currency support

Set `FRUGAL_CURRENCY=BRL` (or `EUR`, `GBP`) in your shell environment.
The tracker reads that and:

1. Computes a per-currency block (`in_brl`, `in_eur`, `in_gbp`) in the
   `/metrics` response, with `{real_cost, naive_cost, saved, guaranteed_saved, symbol}`.
2. The statusline shows the target currency in the primary position
   with USD in parentheses: `R$18.11 ($3.34)`.
3. FX rates come from `fx.js`, which fetches
   `https://api.exchangerate.host/latest?base=USD&symbols=BRL,EUR,GBP`
   once per 24h and caches in `.fx-cache.json`. On network failure,
   falls back to a hard-coded rate (updated manually — see `FALLBACK_RATES`
   in `fx.js`).

## How to verify on your own corpus

```bash
# Restart the tracker so you're on v0.6
pkill -f savings-tracker.js
FRUGAL_TRACKER_VERBOSE=1 nohup node ~/.claude/tools/router/savings-tracker.js &

# Dump the real numbers
curl -s http://127.0.0.1:7821/metrics | node -e \
  "const m=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(JSON.stringify(m,null,2))"

# Read the human-friendly summary
curl -s http://127.0.0.1:7821/summary

# Check if OAuth is healthy
curl -s http://127.0.0.1:7821/real
```

If `/real` returns `ok: false, reason: oauth_error`, run `claude auth login`
and the next prompt will refresh `.budget-cache.json`.

## References

- `pricing.js` — pricing table and cost functions
- `fx.js` — FX cache helper
- `savings-tracker.js` — `computeMetrics()` is the core loop
- `backtest.test.js` — tests 12-17 cover the v0.6 cost model
- `AUDIT.md` — the audit that motivated this rewrite

_Last reviewed: 2026-04-12. Prices change — cross-check against the
provider docs quarterly._

---

## Success-fee model (v0.9+)

A frugal success-fee charges a percentage of **verified savings** —
i.e., `guaranteed_saved`, not `advisory_saved`.

### Why guaranteed only?
Advisory savings are estimates. Charging on estimates creates disputes.
`guaranteed_saved` is auditable: every `option_a_hit` in `decisions.log`
has a timestamp, a prompt hash, and the Ollama model that generated the
answer. A client can independently verify every entry.

### Current fee structure (reference)
| Tier | Verified savings/month | Fee |
|---|---|---|
| Starter | < $50 | 0% |
| Growth | $50 – $500 | 15% of verified savings |
| Scale | > $500 | 10% of verified savings |

### How to audit
```bash
# Export all option_a_hit events for a given month
node ~/.claude/tools/router/backtest.js --export-delta --since 2026-04-01
# The output includes prompt_count, guaranteed_saved, and audit trail
```

### What increases guaranteed savings
1. **Ollama installed + qwen3:30b** — better Option-A quality → more hits
2. **Low-complexity project** — more T0-eligible prompts
3. **High prompt volume** — law of large numbers → more Option-A hits
