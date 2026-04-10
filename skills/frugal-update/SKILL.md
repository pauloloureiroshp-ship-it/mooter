---
name: frugal-update
description: >
  Updates the frugal router to the latest version: pulls from GitHub, runs backtest, syncs
  runtime, and optionally pushes delta to the community hub. Use when the user types
  "/frugal-update", "actualizar frugal", "update frugal", "frugal upgrade", "sync frugal",
  "nova versão do frugal", or wants to make sure they have the latest classifier and community tuning.
---

# /frugal-update — Update frugal to latest version

Pulls the latest frugal from GitHub, runs backtest to improve local classifier, syncs runtime files,
and optionally sends an anonymized delta to the community hub.

---

## Execution steps (in order)

### Step 1 — Check current version

```bash
cat ~/frugal/package.json 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('CURRENT='+d.version)" 2>/dev/null || echo "CURRENT=unknown"
```

### Step 2 — Pull from GitHub

```bash
cd ~/frugal && git fetch origin main && git status
# If behind: git pull origin main
# If conflicts: report to user and stop
```

### Step 3 — Run backtest (improve local classifier)

```bash
node ~/.claude/tools/router/backtest.js 2>/dev/null | tail -5
# If --export-delta available and user has opted in:
# node ~/.claude/tools/router/backtest.js --export-delta
```

### Step 4 — Pull community tuning from hub

```bash
node ~/.claude/tools/router/hub-pull.js --force 2>/dev/null
```

### Step 5 — Sync runtime

```bash
cp ~/frugal/tools/router/classify.js ~/.claude/tools/router/classify.js
cp ~/frugal/tools/router/inject_context.js ~/.claude/tools/router/inject_context.js
cp ~/frugal/tools/router/arbiter.js ~/.claude/tools/router/arbiter.js
cp ~/frugal/tools/router/backtest.js ~/.claude/tools/router/backtest.js
cp ~/frugal/tools/router/savings-tracker.js ~/.claude/tools/router/savings-tracker.js
cp ~/frugal/tools/router/hub-push.js ~/.claude/tools/router/hub-push.js
cp ~/frugal/tools/router/hub-pull.js ~/.claude/tools/router/hub-pull.js
cp ~/frugal/tools/router/onboarding.js ~/.claude/tools/router/onboarding.js
cp ~/frugal/tools/router/patterns.js ~/.claude/tools/router/patterns.js
cp ~/frugal/tools/router/frugal-mode.js ~/.claude/tools/router/frugal-mode.js
cp ~/frugal/agents/*.md ~/.claude/agents/
# Sync all frugal skills
for skill in frugal-status frugal-savings frugal-route frugal-summary frugal-update frugal-beast frugal-zen frugal-auto; do
  mkdir -p ~/.claude/skills/$skill
  cp ~/frugal/skills/$skill/SKILL.md ~/.claude/skills/$skill/SKILL.md 2>/dev/null || true
done
echo "SYNC=done"
```

### Step 6 — Self-test

```bash
node ~/.claude/tools/router/classify.js "refactor architecture for multi-tenant" 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.tier==='T3'?'TEST=pass':'TEST=fail tier='+d.tier)"
```

---

## Output format

```
⚡ frugal — update

  Versão anterior:  v0.9.1
  Versão actual:    v0.9.2  (+3 commits)

  ✓ Backtest concluído  (181 decisões analisadas)
  ✓ Community tuning actualizado  (hub v1.3, 14,371 amostras)
  ✓ Runtime sincronizado  (8 ficheiros)
  ✓ Self-test passou  (T3 para arquitectura)

Novidades em v0.9.2:
  • Onboarding automático na primeira sessão
  • Delta push ao hub após backtest diário
  • Time-based routing para Claude Max

Delta enviado ao hub: sim (anonimizado, 181 prompts)
```

If git pull fails (no internet, conflicts), report clearly and stop at step 2.
If self-test fails, report the actual tier received and don't mark update as complete.
If hub-pull fails silently, note "hub offline — tuning local mantido" and continue.
