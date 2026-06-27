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
# Sync the ENTIRE router runtime via glob — no hardcoded file list to drift.
# (A hardcoded list silently missed runtime files twice: Wave 13 "Show the Herd"
#  hooks stop_hook/post_tool_badge/subagent_tracker, and Wave 58 chip-composer +
#  matrix-status — each left the runtime require chain broken until hand-patched.
#  A glob can't go stale: every new tools/router/*.js propagates automatically.)
# Excludes *.test.js — tests never run in the hook runtime.
for f in ~/frugal/tools/router/*.js; do
  case "$f" in *.test.js) continue ;; esac
  cp "$f" ~/.claude/tools/router/"$(basename "$f")"
done
# version.json is the runtime SSOT for `mooter --version` but is NOT a .js, so the glob above
# skips it. Sync explicitly or it drifts (was stuck at 0.11.0 while the repo shipped 1.38.0).
cp ~/frugal/tools/router/version.json ~/.claude/tools/router/version.json 2>/dev/null

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
```

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
