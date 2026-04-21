---
name: frugal-savings
description: >
  Shows detailed savings report: total money saved, per-tier breakdown, projection for the year,
  and comparison against what it would have cost without frugal. Use when the user types
  "/frugal-savings", "/frugal-economy", "quanto poupei", "show me the savings", "frugal report",
  "quanto custou", or wants to see the economic impact of the router.
---

# /frugal-savings — Savings & Economy Report

Full economic breakdown: what you spent, what you saved, what it would have cost without frugal.

---

## Execution

```bash
# Full stats from the tracker
node ~/.claude/tools/router/stats.js 2>/dev/null

# Or pull from the HTTP endpoint if savings-tracker is running
curl -s http://localhost:7821/metrics 2>/dev/null || echo "tracker-offline"

# Decision log analysis
node -e "
const fs = require('fs'), os = require('os'), path = require('path');
const log = path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');
if (!fs.existsSync(log)) { console.log('NO_LOG'); process.exit(0); }
const lines = fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);
const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const classified = events.filter(e => e.tier);
const tiers = {T0:0,T1:0,T2:0,T3:0};
classified.forEach(e => { tiers[e.tier] = (tiers[e.tier]||0)+1; });
const total = classified.length;
console.log(JSON.stringify({total, tiers,
  t0_pct: total ? (tiers.T0/total*100).toFixed(1) : 0,
  t3_pct: total ? (tiers.T3/total*100).toFixed(1) : 0
}));
" 2>/dev/null
```

---

## Output format

Present as a savings dashboard in PT-PT:

```
💰 frugal — relatório de economia

Período: [data do primeiro evento] → hoje
Prompts classificados: 181

┌─────────────────────────────────────────────┐
│  Tier        Prompts    %      Custo real   │
│  T0 Ollama    106      58.6%    $0.00       │
│  T1 Haiku       0       0%      $0.00       │
│  T2 Sonnet     41      22.7%    $0.33       │
│  T3 Opus       34      18.8%    $1.53       │
│  ─────────────────────────────────────────  │
│  TOTAL        181               $1.86       │
└─────────────────────────────────────────────┘

Se tudo fosse para Opus:    $8.15
Poupança real:             $6.29   (77.2%)

Projecção anual (ao ritmo actual):
  Com frugal:   ~$167/ano
  Sem frugal:   ~$733/ano
  Poupança:     ~$566/ano por developer

Hardware a optimizar: RTX 4090 — qwen3:30b disponível
  → Activar T0 local de alta qualidade aumentaria poupança para ~88%
```

If stats.js output is unavailable, calculate from decisions.log directly.
Round all dollar amounts to 2 decimal places.
Always show the "if everything went to Opus" baseline for context.
