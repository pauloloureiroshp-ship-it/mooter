---
name: frugal-status
description: >
  Shows the complete live status of the frugal router. Use when the user types "/frugal-status",
  "frugal status", "como esta o frugal", "frugal health", or wants to see if the router is
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

# 4. Session stats (today)
node -e "
const fs=require('fs'),path=require('path');
const log=path.join(require('os').homedir(),'.claude','tools','router','decisions.log');
try{
  const lines=fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean);
  const today=new Date().toISOString().slice(0,10);
  const tierCost={T0:0,T1:0.002,T2:0.008,T3:0.045};
  let tiers={T0:0,T1:0,T2:0,T3:0},actual=0,naive=0,count=0;
  for(const l of lines){try{const d=JSON.parse(l);if(d.tier&&d.ts&&d.ts.startsWith(today)){tiers[d.tier]++;actual+=tierCost[d.tier]||0;naive+=0.045;count++}}catch{}}
  const allActual=lines.reduce((s,l)=>{try{const d=JSON.parse(l);return s+(tierCost[d.tier]||0)}catch{return s}},0);
  const allNaive=lines.length*0.045;
  console.log(JSON.stringify({count,tiers,actual:actual.toFixed(2),naive:naive.toFixed(2),saved:(naive-actual).toFixed(2),pct:naive>0?((1-actual/naive)*100).toFixed(0):'0',total:lines.length,totalSaved:(allNaive-allActual).toFixed(2),totalPct:allNaive>0?((1-allActual/allNaive)*100).toFixed(0):'0'}));
}catch{console.log(JSON.stringify({count:0,tiers:{T0:0,T1:0,T2:0,T3:0},saved:'0.00',pct:'0',total:0,totalSaved:'0.00',totalPct:'0'}))}
" 2>/dev/null

# 5. Hub connectivity
curl -s --max-time 3 https://frugal-hub.frugal-hub.workers.dev/health 2>/dev/null | node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('HUB='+d.ok)}catch{console.log('HUB=offline')}"

# 6. Hardware tier
cat ~/.claude/tools/router/hw-capability.json 2>/dev/null | node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('HW='+d.hw_tier+' GPU='+d.name+' T0='+d.recommended_t0)}catch{console.log('HW=unknown')}"

# 7. Active mode
cat ~/.claude/tools/router/.frugal-mode.json 2>/dev/null | node -e "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('MODE='+d.mode)}catch{console.log('MODE=auto')}"
```

---

## Output format

Present as a clean, friendly status panel in PT-PT:

```
frugal status — tudo verde

  Router       active · last prompt 3s ago · T0 (free)
  Savings      $0.84 saved this session (89% efficiency)
  Ollama       qwen2.5:3b online · 312ms avg
  Hub          connected · frugal-hub.frugal-hub.workers.dev
  Hardware     RTX 4090 · gpu_high
  Mode         Auto (intelligent routing)

  Today: 12 prompts · T0=10 · T1=1 · T2=1 · T3=0
  Today you'd pay ~$0.03 instead of ~$0.54. Saved: $0.51.

  All time: 263 prompts · saved $8.42 (78%)

Last 3 decisions:
  14:32:11  T0  conf=0.91  trivial_command
  14:31:44  T2  conf=0.78  bug_investigation
  14:28:03  T3  conf=0.95  architecture
```

If any component is missing or offline, show it clearly but don't alarm:
- Ollama offline → "Ollama: offline (T0 unavailable — install from ollama.com)"
- Hub offline → "Hub: offline (local-only mode, telemetry queued)"
- No decisions → "No decisions yet — type any prompt to start"

If the user just installed, be encouraging:
"Everything looks good! Type any prompt and frugal will classify it automatically."
