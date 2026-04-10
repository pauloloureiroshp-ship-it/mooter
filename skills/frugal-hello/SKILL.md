---
name: frugal-hello
description: >
  Welcome message for new frugal users. Shows what happened on the last prompt in a friendly way.
  Use when the user types "/frugal-hello", "frugal hello", "what just happened", or on first use.
  Reads the last entry from decisions.log and formats it as a beginner-friendly explanation.
---

# /frugal-hello — Welcome to frugal

Shows new users what frugal just did on their last prompt. Designed to create a "WOW" moment.

---

## Execution

Run these commands, then format the output:

```bash
# 1. Read last decision from log
tail -1 ~/.claude/tools/router/decisions.log 2>/dev/null | node -e "
const line = require('fs').readFileSync(0,'utf8').trim();
try {
  const d = JSON.parse(line);
  const tierCost = { T0: 0.00, T1: 0.002, T2: 0.008, T3: 0.045 };
  const tierLabel = { T0: 'Ollama local — free', T1: 'Haiku — very cheap', T2: 'Sonnet — moderate', T3: 'Opus — full power' };
  const saved = tierCost.T3 - (tierCost[d.tier] || 0);
  console.log(JSON.stringify({
    tier: d.tier,
    category: d.task_category,
    confidence: d.confidence,
    prompt_len: d.prompt_len,
    model: d.recommended_model,
    cost_label: tierLabel[d.tier] || 'unknown',
    saved_per_prompt: saved.toFixed(3),
    cache_hit: d.cache_hit || false,
    ts: d.ts
  }));
} catch { console.log('NO_DATA'); }
"

# 2. Count total decisions and savings
node -e "
const fs = require('fs'), path = require('path');
const log = path.join(require('os').homedir(), '.claude', 'tools', 'router', 'decisions.log');
try {
  const lines = fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean);
  const tierCost = { T0: 0, T1: 0.002, T2: 0.008, T3: 0.045 };
  let actual = 0, naive = 0;
  for (const l of lines) { try { const d = JSON.parse(l); if (d.tier) { actual += tierCost[d.tier]||0; naive += 0.045; } } catch {} }
  console.log(JSON.stringify({ total: lines.length, saved: (naive-actual).toFixed(2), pct: naive > 0 ? ((1-actual/naive)*100).toFixed(0) : '0' }));
} catch { console.log(JSON.stringify({ total: 0, saved: '0.00', pct: '0' })); }
"
```

---

## Output format

Present as a warm welcome panel:

```
Welcome to frugal!

Here's what happened on your last prompt:

  Category     trivial_rename
  Tier         T0 (Ollama local — free)
  Model        qwen2.5:3b
  Confidence   0.94
  Cost         $0.000 (instead of ~$0.045 with Opus)

  Your prompts never leave your machine.
  Only the tier (T0/T1/T2/T3) is shared anonymously to improve the algorithm.

Session so far: 12 prompts · saved $0.48 (89%)

Commands to try:
  /frugal-status   full health check
  /frugal-savings  detailed savings report
  /frugal-beast    force Opus on everything (when you need max power)
  /frugal-zen      cap at cheapest tier (maximum savings)
```

If decisions.log is empty or missing:
```
Welcome to frugal!

No decisions recorded yet — type any prompt and frugal will classify it automatically.
Then come back here with /frugal-hello to see what happened.
```
