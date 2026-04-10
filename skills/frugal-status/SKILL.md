---
name: frugal-status
description: >
  Shows the complete live status of the frugal router. Use when the user types "/frugal-status",
  "frugal status", "como está o frugal", "frugal health", or wants to see if the router is
  working correctly. Returns: hook status, Ollama availability, hub connectivity, last decision,
  and a doctor-mode check. Works on any OS (Windows/macOS/Linux).
---

# /frugal-status — Live Health Check

Shows a complete snapshot of the frugal router: is it running, what did it just decide, and is everything connected.

---

## Execution

Run these in parallel, then format the output:

```bash
# 1. Is the hook installed?
grep -l "inject_context" ~/.claude/settings.json 2>/dev/null && echo "HOOK=ok" || echo "HOOK=missing"

# 2. Is Ollama running?
curl -s --max-time 2 http://localhost:11434/api/tags 2>/dev/null | node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('OLLAMA=ok models='+d.models.length)}catch{console.log('OLLAMA=offline')}"

# 3. Last 3 decisions
tail -3 ~/.claude/tools/router/decisions.log 2>/dev/null | node -e "
const lines=require('fs').readFileSync(0,'utf8').trim().split('\n');
lines.forEach(l=>{try{const d=JSON.parse(l);console.log(d.ts.slice(11,19)+' '+d.tier+' conf='+d.confidence.toFixed(2)+' '+d.task_category)}catch{}})
" 2>/dev/null

# 4. Current savings total
node ~/.claude/tools/router/stats.js 2>/dev/null | tail -6

# 5. Hub connectivity (non-blocking)
curl -s --max-time 3 https://frugal-hub.frugal-hub.workers.dev/health 2>/dev/null | node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('HUB='+d.ok)}catch{console.log('HUB=offline')}"

# 6. Hardware tier
cat ~/.claude/tools/router/hw-capability.json 2>/dev/null | node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('HW='+d.hw_tier+' T0='+d.recommended_t0)}catch{console.log('HW=unknown')}"
```

---

## Output format

Present as a compact status panel in PT-PT:

```
⚡ frugal — status

  Hook          ✓ activo  (UserPromptSubmit)
  Classificador ✓ v0.9.2
  Ollama        ✓ online  (3 modelos)  — ou — ⚠ offline (T0 indisponível)
  Hub           ✓ online  — ou — ○ offline (telemetria local apenas)
  Hardware      RTX 4090 · gpu-high · T0=qwen3:30b

Últimas decisões:
  14:32:11  T0   conf=0.91  trivial_command
  14:31:44  T2   conf=0.78  bug_investigation
  14:28:03  T3   conf=0.95  architecture

Poupança total:  $6.29  (77.2%)   181 prompts
```

If any component is missing or offline, add a fix suggestion in one line.
If decisions.log doesn't exist yet, say "Ainda sem decisões registadas — escreve um prompt para começar."
