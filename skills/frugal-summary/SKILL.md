---
name: frugal-summary
description: >
  Generates a summary of the current session or recent routing decisions: what tasks were done,
  which tiers were used, what was saved, and any misroutes detected. Use when the user types
  "/frugal-summary", "resume a sessão", "o que fizemos hoje", "frugal session report",
  "show routing history", "o que o frugal decidiu hoje", or at the end of a work session.
---

# /frugal-summary — Session & Routing Summary

Summarises what happened in the current session: tasks, routing decisions, savings, and quality signals.

---

## Execution

```bash
# Get last N decisions (session = last 2 hours by default)
node -e "
const fs = require('fs'), os = require('os'), path = require('path');
const log = path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');
if (!fs.existsSync(log)) { console.log('[]'); process.exit(0); }
const lines = fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);
const now = Date.now();
const TWO_HOURS = 2 * 60 * 60 * 1000;
const session = lines
  .map(l => { try { return JSON.parse(l); } catch { return null; } })
  .filter(e => e && e.tier && (now - new Date(e.ts).getTime()) < TWO_HOURS);
console.log(JSON.stringify(session));
" 2>/dev/null
```

---

## Output format

Present a clean narrative summary in PT-PT:

```
📋 frugal — resumo da sessão

Sessão: 14:00 → 16:32  (2h 32min)
Prompts nesta sessão: 23

Distribuição de tiers:
  T0 Ollama    14  (61%)   $0.00
  T2 Sonnet     7  (30%)   $0.18
  T3 Opus       2   (9%)   $0.24
  Total                    $0.42  poupou $1.89 vs tudo-Opus

Decisões notáveis:
  • 14:12 — T3 (conf 0.96): arquitectura multi-tenant [✓ correcto]
  • 14:28 — T2 (conf 0.71): debug websocket reconnect [arbiter consultado]
  • 15:04 — T0 (conf 0.94): rename variável [✓ correcto]
  • 15:47 — T2 → T3 escalado: "vou fazer push" detectado [final-reviewer activado]

Sinais de qualidade:
  Followup imediato (< 30s): 1 decisão — possível misroute em T2
  Taxa de aceitação estimada: ~91%

Língua detectada: PT-PT (87%) / EN (13%)
Hardware: RTX 4090 · T0=qwen3:30b
```

If the session has 0 events, say: "Sem decisões nesta sessão ainda. Escreve um prompt para começar."
If followup_immediate > 2 decisions, add: "⚠ 3+ followups rápidos detectados — o backtest nocturno vai analisar possíveis misroutes."
Always note if the arbiter (Haiku semantic layer) was consulted.
