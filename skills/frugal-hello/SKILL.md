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
# 1. Read last decision from log + 2. Total decisions and savings
# Both use pricing.js (single source of truth) — same numbers as statusline
# and /frugal-savings, no more inconsistencies.
node -e "
const fs = require('fs'), path = require('path'), os = require('os');
const pricing = require(path.join(os.homedir(), '.claude', 'tools', 'router', 'pricing'));
const log = path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');
const tierLabel = { T0: 'Ollama local — free', T1: 'Haiku — very cheap', T2: 'Sonnet — moderate', T3: 'Opus — full power' };
try {
  const lines = fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean);
  // Last decision
  let last = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    try { const d = JSON.parse(lines[i]); if (d.tier) { last = d; break; } } catch {}
  }
  if (last) {
    const pl = last.prompt_length || last.prompt_len || 200;
    const realCost = pricing.estimateTurnCost(last.tier, pl);
    const naiveCost = pricing.naiveOpusCost(pl);
    console.log(JSON.stringify({
      tier: last.tier,
      category: last.task_category,
      confidence: last.confidence,
      prompt_len: pl,
      model: last.recommended_model,
      cost_label: tierLabel[last.tier] || 'unknown',
      real_cost: realCost.toFixed(4),
      naive_cost: naiveCost.toFixed(4),
      saved_per_prompt: (naiveCost - realCost).toFixed(4),
      cache_hit: last.cache_hit || false,
      ts: last.ts
    }));
  } else { console.log('NO_DATA'); }
  // Cumulative
  let actual = 0, naive = 0, count = 0;
  for (const l of lines) {
    try {
      const d = JSON.parse(l);
      if (!d.tier) continue;
      const pl = d.prompt_length || d.prompt_len || 200;
      actual += pricing.estimateTurnCost(d.tier, pl);
      naive += pricing.naiveOpusCost(pl);
      count++;
    } catch {}
  }
  console.log(JSON.stringify({
    total: count,
    real_cost: actual.toFixed(2),
    naive_cost: naive.toFixed(2),
    saved: (naive - actual).toFixed(2),
    pct: naive > 0 ? ((1 - actual / naive) * 100).toFixed(0) : '0'
  }));
} catch { console.log('NO_DATA'); console.log(JSON.stringify({ total: 0, real_cost: '0.00', naive_cost: '0.00', saved: '0.00', pct: '0' })); }
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
  Cost         $0.000 (instead of ~$0.26 with Opus)

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
