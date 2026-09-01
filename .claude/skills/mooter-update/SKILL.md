---
name: mooter-update
description: >
  Updates the mooter router to the latest version: pulls from GitHub, runs backtest, syncs
  runtime (router files + wired hooks), self-checks the Live Context Accumulator, and optionally
  pushes delta to the community hub. Use when the user types
  "/mooter-update", "/frugal-update", "actualizar mooter", "actualizar frugal", "update mooter",
  "update frugal", "mooter upgrade", "frugal upgrade", "sync mooter", "sync frugal",
  "nova versão do mooter", "nova versão do frugal", or wants to make sure they have the latest
  classifier and community tuning.
---

# /mooter-update — Update mooter to latest version

Pulls the latest mooter from GitHub, runs backtest to improve local classifier, syncs runtime files
**and the wired ~/.claude/hooks/ copies**, self-checks the turn-end accumulator, and optionally sends
an anonymized delta to the community hub.

---

## Execution steps (in order)

### Step 1 — Check current version

```bash
# Canonical version lives in tools/router/version.json (the file version-sync.yml bumps
# on-tag) — NOT package.json / repo-root version.json (neither exists → old "CURRENT=unknown").
cat ~/frugal/tools/router/version.json 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('CURRENT='+d.version)" 2>/dev/null || echo "CURRENT=unknown"
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

### Step 5 — Sync runtime (router files + wired hooks)

```bash
# Sync the ENTIRE router runtime via sync-runtime.js — recursive, and with the
# .json set DERIVED from what the code actually requires. No hardcoded list.
#
# History of this line, because it rhymes: a hardcoded list silently missed
# runtime files twice (Wave 13 hooks, Wave 58 chip-composer + matrix-status), so
# it became `for f in ~/frugal/tools/router/*.js`. That glob does NOT descend into
# subdirectories — measured 2026-08-31, right after an update that printed five ✓
# and passed every gate: 204 runtime files from the root copied, and the 17 in
# providers/ + forecast/ + hooks/ left behind. The ollama-api.js fix stayed in
# ~/frugal and never reached the runtime; the new ollama-host.js landed in the
# root and sat there orphaned, required by nobody. No require error, because the
# OLD file doesn't require the NEW one — so the update declared success while the
# $0 engine stayed dead. deepseek-v4.js had never been in the runtime at all.
#
# install.sh already knew (lines ~158-160, "Wave 61. Copy the providers/ subdir
# explicitly"), which is the real defect: installer and updater held two different
# definitions of "the runtime", so a fresh install and an updated machine did not
# converge. sync-runtime.js is now the single definition, the same way
# sync-hooks.js is the single definition of the wired hooks.
#
# Invoked from the REPO copy, not the runtime one: on a machine whose runtime
# predates this file, the runtime copy does not exist yet. The repo copy always does.
node ~/frugal/tools/router/sync-runtime.js

# ── Mirror the WIRED hooks (~/.claude/hooks/) ─────────────────────────────────
# settings.json wires the Stop/UserPromptSubmit hooks at ~/.claude/hooks/<name>,
# NOT ~/.claude/tools/router/. The glob above only refreshes the router copy, so
# the wired Stop hook (gsd-turn-end.js) went stale and silently dropped the Live
# Context Accumulator (accumulateHandoff) → 63 sessions, 0 journals. sync-hooks.js
# mirrors the canonical hooks → ~/.claude/hooks/ (idempotent, additive, .bak backup,
# cross-OS) and runs the post-sync self-check below. It was just copied to runtime
# by the glob above, so invoke the runtime copy.
node ~/.claude/tools/router/sync-hooks.js

# Agents: source is ~/frugal/agents/ (verified git-tracked, 6 *.md). Already a glob — robust.
cp ~/frugal/agents/*.md ~/.claude/agents/ 2>/dev/null

# Skills: the versioned product skills live in ~/frugal/.claude/skills/ — NOT ~/frugal/skills/
# (which does not exist; the old hardcoded loops here pointed there AND listed names like
#  mooter-status / frugal-* that are user-global-only and absent from the repo, so they
#  silently no-op'd). Glob the repo's canonical skill dirs → user-global runtime.
# Additive (cp, never delete): user-global-only skills (mooter-status, frugal-*, generated
#  /mooter-<model> pins) are left untouched — see project_mooter_dynamic_pins memory.
for d in ~/frugal/.claude/skills/*/; do
  [ -f "$d/SKILL.md" ] || continue
  name=$(basename "$d")
  mkdir -p ~/.claude/skills/"$name"
  cp -r "$d"* ~/.claude/skills/"$name"/ 2>/dev/null
done
echo "  ✓ $(ls -d ~/frugal/.claude/skills/*/ 2>/dev/null | wc -l) repo skills + $(ls ~/frugal/agents/*.md 2>/dev/null | wc -l) agents synced"
echo "SYNC=done"
```

### Step 6 — Self-check the wired accumulator (gate)

`sync-hooks.js` (run in Step 5) prints the verdict, but verify it explicitly here so
a stale wired hook can never pass silently. The check reads the path settings.json
actually wires and confirms `gsd-turn-end.js` still contains the accumulator
(`accumulateHandoff` + the `handoff-journal` require):

```bash
node ~/.claude/tools/router/sync-hooks.js --check
node ~/frugal/tools/router/sync-runtime.js --check
```

The second line is the gate that did not exist on 2026-08-31, when the update
printed five ✓ with a stale `providers/ollama-api.js`. It re-walks the repo and
fails if any runtime file still differs from it — **presence of a sync step is
not proof of coverage**. On `WARNING`, re-run `node ~/frugal/tools/router/sync-runtime.js`
(without `--check`) and re-check. Never report the update as complete while it warns.

- **PASS** → `OK self-check: wired Stop hook has the accumulator -> <path>`.
- **FAIL** → it prints `WARNING: Stop hook ligado NAO tem o acumulador - re-sincroniza`
  with the exact wired path. If you see this, re-run `node ~/.claude/tools/router/sync-hooks.js`
  (without `--check`) to repair the mirror, then re-check. Never report the update as
  complete while this fails — the turn-end journal is what feeds the cockpit's honest
  per-session branch/SHA.

### Step 7 — Self-test (classifier)

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
  ✓ Runtime sincronizado  (8 ficheiros + hooks ligados)
  ✓ Acumulador OK  (Stop hook ligado tem accumulateHandoff)
  ✓ Self-test passou  (T3 para arquitectura)

Novidades em v0.9.2:
  • Onboarding automático na primeira sessão
  • Delta push ao hub após backtest diário
  • Time-based routing para Claude Max

Delta enviado ao hub: sim (anonimizado, 181 prompts)
```

If git pull fails (no internet, conflicts), report clearly and stop at step 2.
If self-test fails, report the actual tier received and don't mark update as complete.
If the accumulator self-check (Step 6) fails, repair the mirror and re-check before completing.
If hub-pull fails silently, note "hub offline — tuning local mantido" and continue.
