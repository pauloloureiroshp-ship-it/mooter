# Wave 22 — Honesty Foundation (pre-Wave-23 audit)

> **Goal**: 6 fixes que tornam o statusline 100% honest + preparam terreno para
> Wave 23 "Mooter audits Mooter" mega-audit. Sem Wave 22, Wave 23 não consegue
> validar empíricamente que os spawns aconteceram.
>
> **Gate**: 1 prompt `resume /etc/os-release em 3 linhas` na CLI fresh → 🐄
> chip mostra `1/1/peak1` → Wave 22 PASS → promote prod → Wave 23 unlock.
>
> **Scope**: 1 PR consolidado · 6 fixes · ~6h CC autonomous · zero hub touch
> Tag dev `v1.12.0-honesty-foundation-dev` → promote prod `v1.12.0-honesty-foundation`
>
> **Non-negotiables**:
> - `classify.js` byte-identical (P11 sha256 `7b01eb86…87762`)
> - Wave 21 Day 2 `recordSpawn` preserved intact (fallback path)
> - Wave 13 `subagent_tracker.snapshot()` shape unchanged
> - Wave 19 `token_tracker.snapshot()` shape unchanged
> - Zero PII (logged ou stored)
> - Zero hub touch (tooling-only)
> - UserPromptSubmit hook intact

---

## 0. Pre-flight — Wave 21 prod state (2026-06-05)

- Tag prod: `v1.11.0-coherence-critical` @ bd88256
- Tag dev: `v1.11.0-coherence-critical-dev` @ bd88256
- Main HEAD: 8a0befe (post-merge)
- 🐄 chip: hidden (`buildHerdsChip()` returns '')
- 🪙 T0 tokens: tracked partial (~64% capture rate)
- Stop digest: untested live, code present
- Branding leftover: `~/mooter` symlinks + dezenas .js leftovers

---

## 1. Pre-Wave-22 STEP 0 — empirical discovery (MANDATORY 15 min)

**Lição aprendida Wave 21**: synthetic tests com synthetic payloads não substituem live CLI capture. **Antes de qualquer fix Wave 22, CC DEVE capturar payload SubagentStop real**.

### Action

Antes de Day 1 fixes, CC executa:

```bash
# 1. Backup settings.json
cp ~/.claude/settings.json ~/.claude/settings.json.wave22-bak

# 2. Add SubagentStop hook com debug-only handler (no trackSpawn yet, just capture)
# Manual edit settings.json adicionar entry:
"SubagentStop": [{
  "matcher": "*",
  "hooks": [{
    "type": "command",
    "command": "node -e \"const fs=require('fs');const raw=fs.readFileSync(0,'utf8');fs.appendFileSync('/tmp/mooter-subagentstop-debug.log', raw + '\\n---\\n')\""
  }]
}]

# 3. Fresh CC session, 1 prompt spawn:
# resume /etc/os-release em 3 linhas (espera Done)
# /quit

# 4. Inspect captured payload
cat /tmp/mooter-subagentstop-debug.log
```

### Expected outcomes

- SubagentStop **dispara** em CLI v2.1.165 → schema revelado → build 22.A handler around real fields
- SubagentStop **não dispara** → fallback para Wave 21 Day 2 recordSpawn via PostToolUse (mas debug por que não dispara — settings format? matcher?)
- SubagentStop dispara mas payload differs do Stop hook (background_tasks/session_crons fields per changelog)

### Document findings em `WAVE22_DAY0_SUBAGENTSTOP_PAYLOAD.md`

Fields capturados + decision tree para Day 1 architecture.

---

## 2. Sub-features (6)

### 22.A — SubagentStop hook nativo (CRITICAL — gate everything)

**Goal**: Substituir Wave 21 Day 2 PostToolUse heuristic por hook nativo. Real-time `active/peak` (não aproximado).

**Fix path** (depende do Day 0 findings):

**Path α — SubagentStop dispara**:
1. New handler `tools/router/subagentstop_hook.js`:
   - Read stdin payload
   - Extract: `session_id`, `agent_type` (ou `subagent_type` schema-dependent), duration
   - Call `tracker.trackSpawn` + `tracker.trackComplete` com real duration_ms
2. Wire em `settings.json`:
   ```json
   "SubagentStop": [{
     "matcher": "*",
     "hooks": [{ "type": "command", "command": "node /home/paulo/mooter/tools/router/subagentstop_hook.js" }]
   }]
   ```
3. **`statusline-multi.js buildHerdsChip()`** — remover early return `''` (Wave 21 Day 3 hide) → render real `🐄 N/M/peakK`

**Path β — SubagentStop NÃO dispara**:
- Mantém Wave 21 Day 2 PostToolUse `recordSpawn` path
- Adiciona stderr debug temporário para confirmar disparo
- Investigar settings.json schema OR matcher syntax
- Fallback: SessionStart + transcript parsing on each turn (worse latency mas funciona)

**Validation**: 1 prompt `resume /etc/X em 3 linhas` → `cat /tmp/mooter-herd-<sid>.json` → `cumulative.local-summarizer.count === 1`. Statusline shows `🐄 1/1/peak1`.

**Estimate**: 2h CC (1h handler + 1h validation + iteration).

### 22.B — Token tracker T0/T1 honest counts (depends on 22.A)

**Root cause**: `token_tracker.trackCall` actualmente só capta partial (~64% rate). Same pattern do herd writer — depende do hook que não dispara para inner Bash do subagent.

**Fix path**:

1. Adicionar SubagentStop hook OR PostToolUse Bash filter para detectar `agent_type` top-level → chamar `trackCall(agentType→tier, tokens_in, tokens_out)`
2. Token counts vêm do payload — verificar Day 0 capture se SubagentStop traz token info
3. Alternative: parse Ollama call output stdout para extrair `eval_count` + `prompt_eval_count`

**Validation**: 1 spawn `local-summarizer` → `mooter trail --calls --json` mostra T0 entry com `tokens_in > 0` AND `tokens_out > 0`.

**Estimate**: 1h CC.

### 22.C — Hint vs delegation honest display (POLISH)

**Current**: hint top-of-prompt diz "T1 Haiku 85%" mas Opus spawna local-summarizer (T0). User confusion.

**Fix path**:

Em `statusline-multi.js` adicionar segundo segmento ao hint chip:

```
mooter → 🌱 T0 · 🦙 qwen3:30b · conf 80% · ⚠ exec via Opus
```

OU mais simples — substituir hint pelo tier que actually run (post-spawn detection):

```
exec → 🌱 T0 · 🦙 qwen3:30b · 12.4k tokens · 7s
```

**Decision Paulo**: qual format? (decisão deferred no brief, CC apresenta opções via AskUserQuestion)

**Estimate**: 30 min CC.

### 22.D — Stop digest live validation

**Root cause**: Wave 19/20 Stop digest code present mas untested live. Tem dependência do herd file ser escrito (22.A) e token tracker honest (22.B).

**Fix path**:

1. Após 22.A + 22.B funcionarem live, correr 5 spawns + `/quit` → confirmar Stop digest aparece com:
   - TOKENS BY TIER (T0:>0, T1, T2, T3)
   - CHOICE REASONS
   - HERD (local-summarizer × 5)
   - SAVINGS
   - PER-TASK BREAKDOWN
2. Fix any regressões encontradas
3. Add empirical test `wave22-stop-digest.test.js`: simula fim de sessão + assert all 5 secções renderizam

**Estimate**: 30 min CC.

### 22.E — Branding cleanup completo

**Root cause**: `~/mooter` é symlink para `~/frugal` → `/mnt/c/.../frugal`. Plus dezenas .js files no canónico ainda mencionam "frugal" em comentários/strings.

**Fix path**:

1. `grep -rli "frugal" tools/ landing/ docs/ | grep -v node_modules | grep -v .git`
2. Para cada match: distinguir entre:
   - **Comentários histórico** (manter, mencionar context "pre-rebrand")
   - **Strings de runtime** (rename → "mooter")
   - **Symlinks/aliases** (review se preservar compat)
3. Specific:
   - `frugal-turn-header.js` filename → consider rename para `mooter-turn-header.js` (com symlink legacy)
   - Variables `FRUGAL_*_ENV` → `MOOTER_*_ENV` (com fallback)
   - User-facing strings "frugal recommends" / "frugal save" → "mooter"
4. **NÃO** fazer rename do directório `~/frugal` → grande risk break

**Validation**: `grep -rli "frugal" tools/ | wc -l` deve descer de N para <5 (apenas histórico em comments).

**Estimate**: 1h CC.

### 22.F — Pastor "trained on N decisions" sync

**Root cause**: statusline mostra `🧬 baseline · trained on 8 decisions` mas decisions_v2.jsonl tem 50+ entries. Counter is reading stale state.

**Fix path**:

1. `grep "trained on" tools/router/statusline-multi.js` — find render path
2. Find data source (provavelmente `tuning-state.json` ou similar)
3. Update data source on each tuning run + statusline reads fresh count

**Validation**: statusline shows count matching `wc -l decisions_v2.jsonl`.

**Estimate**: 30 min CC.

---

## 3. Sequência (~6h autonomous)

### Day 0 — Recon (15 min)
- SubagentStop payload capture (acima §1)
- Document findings em `WAVE22_DAY0_SUBAGENTSTOP_PAYLOAD.md`

### Day 1 — Implementation (~5h)
1. 22.A SubagentStop hook + handler + statusline unhide (~2h)
2. 22.B Token tracker honest (~1h)
3. 22.C Hint vs delegation display (~30 min, com AskUserQuestion se needed)
4. 22.D Stop digest validation (~30 min)
5. 22.E Branding cleanup (~1h)
6. 22.F Pastor decisions sync (~30 min)

### Day 1 — Tests + closure (~1h)
- Tests 6 new (1 per sub-feature)
- classify.js sha256 check
- PR squash → branch `wave22-honesty-foundation`
- final-reviewer T2 Sonnet
- Tag dev `v1.12.0-honesty-foundation-dev`

---

## 4. Non-negotiables (verificação em cada commit)

| # | Item | Como verificar |
|---|---|---|
| 1 | `classify.js` byte-identical | `sha256sum tools/router/classify.js` → `7b01eb86…87762` |
| 2 | Wave 21 Day 2 recordSpawn preserved | grep `recordSpawn` no `post_tool_badge.js` → still present (fallback) |
| 3 | Wave 13 subagent_tracker shape | snapshot() keys unchanged |
| 4 | Wave 19 token_tracker shape | snapshot() keys unchanged |
| 5 | Zero PII | grep para prompts/strings em payload writes |
| 6 | Zero hub touch | `git diff --name-only main` zero ficheiros em `hub/` |
| 7 | UserPromptSubmit intact | smoke test bash output |
| 8 | Tag prod gate empirical | 1 prompt CLI live → herd file populated → manual confirm |

---

## 5. Definition of Done (Wave 22)

1. ✅ Day 0 SubagentStop payload schema documented
2. ✅ 22.A — 🐄 chip mostra `N/M/peakK` real (não 0/0/peak0) após spawn
3. ✅ 22.B — 🪙 T0 chip mostra tokens count match com Ollama actual usage
4. ✅ 22.C — hint vs delegation discrepancy visible OR resolved
5. ✅ 22.D — Stop digest aparece após `/quit` com 5 secções completas
6. ✅ 22.E — grep "frugal" no codebase < 5 matches (só histórico comments)
7. ✅ 22.F — `🧬 trained on N decisions` matches `wc -l decisions_v2.jsonl`
8. ✅ classify.js sha256 = `7b01eb86…87762`
9. ✅ E2E live PASS (5 spawns + cat herd file + Stop digest)
10. ✅ Tag prod `v1.12.0-honesty-foundation` aplicada
11. ✅ Notion sub-page + SYNC.md update

---

## 6. Master prompt para CC (paste when ready)

```
Inicia Wave 22 Honesty Foundation conforme docs/strategy/WAVE22_FOUNDATION_KICKOFF.md.

Pré-flight: Wave 21 v1.11.0-coherence-critical EM PROD (main 8a0befe, dev a8d255b, tag pushed). 🐄 chip hidden pending Wave 22 SubagentStop hook nativo. Token tracker partial capture. Branding leftover. Wave 23 "Mooter audits Mooter" mega-audit depends on Wave 22 honest tracking.

Scope: 1 PR consolidado com 6 fixes — 22.A SubagentStop hook (CRITICAL gate) + 22.B token honest + 22.C hint vs delegation + 22.D Stop digest live + 22.E branding cleanup + 22.F Pastor decisions sync.

PRIMEIRO Day 0 RECON OBRIGATÓRIO:
  Captura empirical payload SubagentStop antes de qualquer fix.
  1. cp ~/.claude/settings.json ~/.claude/settings.json.wave22-bak
  2. Adiciona SubagentStop hook com debug-only handler que append payload a /tmp/mooter-subagentstop-debug.log
  3. Fresh CC session + 1 prompt 'resume /etc/os-release em 3 linhas' + /quit
  4. cat /tmp/mooter-subagentstop-debug.log
  5. Document findings em docs/strategy/WAVE22_DAY0_SUBAGENTSTOP_PAYLOAD.md
  6. Decide Path α (SubagentStop dispara) OU Path β (fallback PostToolUse)

Lê PRIMEIRO:
  - docs/strategy/WAVE22_FOUNDATION_KICKOFF.md inteiro
  - docs/strategy/WAVE21_DAY2_HOTFIX_FINDINGS.md (recordSpawn agent_type+agent_id signal — fallback)
  - tools/router/subagent_tracker.js (Wave 13 shape — preserve)
  - tools/router/post_tool_badge.js (Wave 21 Day 2 recordSpawn — preserve intact)
  - tools/router/statusline-multi.js (buildHerdsChip Wave 21 Day 3 hide — unhide if 22.A PASS)
  - tools/router/token_tracker.js (Wave 19 shape — preserve)
  - tools/router/stop_hook.js (Wave 13.1 stderr + Wave 19 Day 4 expansion)
  - tools/router/classify.js (P11 sha256 7b01eb86…87762 — NUNCA tocar)
  - ~/.claude/settings.json (current hook config)
  - ~/.claude/cache/changelog.md (SubagentStop schema hints)

Non-negotiables (verificar em cada commit):
  - classify.js byte-identical (sha256 P11 GUARD)
  - Wave 21 Day 2 recordSpawn preserved (fallback path stays available)
  - Wave 13 subagent_tracker.snapshot() shape unchanged
  - Wave 19 token_tracker.snapshot() shape unchanged
  - Zero PII em payload writes/logs
  - Zero hub touch
  - UserPromptSubmit hook intact
  - settings.json edits documented + backup mantido

Sequência (~6h autonomous):

Day 0 Recon (15 min):
  1. SubagentStop payload capture via debug handler
  2. Document schema em WAVE22_DAY0_SUBAGENTSTOP_PAYLOAD.md
  3. Decide Path α vs β para 22.A

Day 1 Fixes (~5h):
  4. 22.A SubagentStop hook + handler + statusline unhide (Path decided Day 0)
  5. 22.B Token tracker honest counts (mesmo signal pattern)
  6. 22.C Hint vs delegation honest display (AskUserQuestion para format se 3 opções razoáveis)
  7. 22.D Stop digest live validation (corre 5 spawns + /quit + verify 5 secções)
  8. 22.E Branding cleanup (grep + selective rename, NÃO touch ~/frugal directory)
  9. 22.F Pastor decisions sync (statusline counter live)
  10. Tests 6 new (1 per sub-feature)
  11. classify.js sha256 check
  12. Remove debug temporary code Day 0
  13. PR squash → branch wave22-honesty-foundation
  14. final-reviewer T2 Sonnet

Tag dev v1.12.0-honesty-foundation-dev.

E2E LIVE VALIDATION GATE (mandatory antes promote prod):
  - Paulo abre fresh CC session
  - 5 prompts 'resume /etc/X em 3 linhas' (X = os-release, hostname, timezone, shells, group)
  - Observa statusline: 🐄 5/5/peak1 + T0 tokens >0 + hint coherent
  - /quit → Stop digest aparece com 5 secções
  - cat /tmp/mooter-herd-$CLAUDE_CODE_SESSION_ID.json → count===5

NÃO promover prod até esse PASS.

Reporta findings em docs/strategy/WAVE22_DAY_X_FINDINGS.md por etapa.

Após Wave 22 ship prod, Paulo + Cowork inicia Wave 23 "Mooter audits Mooter" — corpus T0/T1/T2/T3 audit da própria solução, output AUDIT_REPORT.md + LoRA training data + benchmark marketing artifacts.
```

---

## 7. E2E Live Validation Gate (post-merge, Paulo executa)

Após CC abre PR + Cowork mergeu dev:

### Sequência Paulo WSL (10 min):

```bash
# 1. Pull dev + sync runtime (se symlinks não autom)
cd ~/frugal && git fetch origin && git checkout dev && git pull origin dev

# 2. Verify Wave 22 fixes runtime
grep -c "SubagentStop" ~/.claude/settings.json
# esperado: ≥ 1

grep "buildHerdsChip" ~/.claude/tools/router/statusline-multi.js | head -5
# esperado: ver render real (não return '')

# 3. Fresh CC
cd ~ && claude
```

### Dentro do CC:

```
resume o ficheiro /etc/os-release em 3 linhas
resume o ficheiro /etc/hostname em 3 linhas
resume o ficheiro /etc/timezone em 3 linhas
resume o ficheiro /etc/shells em 3 linhas
resume o ficheiro /etc/group em 3 linhas
```

### Após 5 Dones, observa statusline:

| Chip | Pre-Wave-22 | Post-Wave-22 esperado |
|---|---|---|
| 🐄 herd | hidden | `🐄 5/5/peak1` |
| 🪙 T0 | partial capture | `T0:~10k tkns` coerente com 5 × ~2k spawn cost |
| Hint top | T1 Haiku (mas exec T0) | `mooter → exec T0 qwen3:30b` |
| 🧬 trained on | stale `8 decisions` | actual `N decisions` from decisions_v2.jsonl |

### `/quit` no CC + observa Stop digest:

```
🐮 Mooter session report — Xm Ys
  TOKENS BY TIER
  T0 (local ollama qwen3:30b)   ~10k tokens · 5 calls · $0.00
  T1 ...
  T2 ...
  T3 ...

  CHOICE REASONS
  5× T0 → classify_score>0.80

  HERD
  local-summarizer × 5 · avg Xs · peak: 1

  SAVINGS
  Total saved vs all-Opus: $X.XX

  PER-TASK BREAKDOWN
  Task 1: "resume /etc/os-release" → ...
  ...
```

### Bash verify:

```bash
cat /tmp/mooter-herd-$CLAUDE_CODE_SESSION_ID.json
# esperado: cumulative.local-summarizer.count === 5

grep -c "trained on" ~/.claude/tools/router/statusline-multi.js
# esperado: count matches decisions_v2.jsonl wc -l
```

### Gate decision:

| Result | Action |
|---|---|
| ✅ Todos 6 chips PASS + ficheiro herd + Stop digest | Promote prod tag `v1.12.0-honesty-foundation` + **Wave 23 unlock** |
| ⚠️ 4-5/6 PASS | Avalia critical vs polish, decide hold OR ship-with-known-issue |
| ❌ < 4/6 PASS | Wave 22 Day 2 follow-up brief |

---

## 8. Após Wave 22 prod → Wave 23 trigger

Quando v1.12.0-honesty-foundation está prod:
- Compor `WAVE23_MOOTER_AUDITS_MOOTER_KICKOFF.md` (task #222)
- 4 phases: corpus T0 / validate T1 / insights T2 / benchmark T3
- Output: AUDIT_REPORT.md + AUDIT_BENCHMARK.md + lora_train.jsonl + marketing
- ~6h CC + Ollama runtime
- **Marketing gold**: tweet thread + blog post + README badge

---

**Composed by Cowork, 2026-06-05 pós-Wave 21 prod. 6 honest foundation fixes pré
Wave 23 mega-audit. ~6h CC autonomous + 15 min Day 0 recon. Tag v1.12.0. Wave 23
unlock após PASS.**
