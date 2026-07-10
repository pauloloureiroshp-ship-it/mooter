# Wave 21 — Critical Coherence Fixes (Path α — Pre-Friends-Launch)

> **Goal**: 5 fixes para parar as mentiras estruturais da statusline + bash output
> antes do friends-launch. Diagnóstico fonte: `WAVE21_COHERENCE_AUDIT_DIGEST.md`
> (CC audit 2026-06-05) + statusline final real Paulo + 50 spawns local-summarizer
> que NUNCA escreveram `/tmp/mooter-herd-*.json`.
>
> **Pre-friends-launch GO/NO-GO blockers**: TODOS os 5 (C1-C5)
>
> **Scope**: 1 PR consolidado · 5 fixes · ~5h CC autonomous · zero hub touch
> Tag dev `v1.11.0-coherence-critical-dev` → promote prod `v1.11.0-coherence-critical`
>
> **Non-negotiables**:
> - `classify.js` byte-identical (P11 sha256 `7b01eb86...87762`) — verificar em cada commit
> - Wave 19 token tracker `token_tracker.js` snapshot() shape unchanged
> - Wave 13 `subagent_tracker.js` snapshot() shape unchanged (interna pode mudar)
> - Wave 20.A "mooter →" branding mantido (não regredir para "frugal")
> - Zero PII em prompts/output/payload
> - Zero hub touch (tooling-only)
> - PostToolUse hook contract: silent stderr/stdout no-throw mantido

---

## 0. Evidência fonte (CC audit 2026-06-05)

### Statusline final Paulo (após ~50 spawns local-summarizer):

```
🐮 saved $3.71 all-time (78% vs all-Opus)  █▃▃▃▃▃▃▃██ last 10  ·  T3 opus · conf 0.90 · 🐄×0
🏠 2/56 calls (4%) · 12% tokens local · ░░░░░░░░░░ 0% local · 🎮 RTX 4090 25% VRAM (6.1/24 GB) · ☁ Claude Max 100% · 5h reset · 🪙 T0:12.3k tkns · T1:0 · T2:0 · T3:93.7k · 🐄 0/0/peak0 · 🧬 baseline · trained on 8 decisions
```

### Bash output anomalies observed (CC findings + log):

1. **🐄 chip "0/0/peak0" persistente** após 50 spawns confirmados (`Done (N tool uses · X tokens)`)
2. **🐄 aparece DUAS vezes** na statusline (top `🐄×0` + bottom `🐄 0/0/peak0`)
3. **🏠 chip mostra 3 valores conflituantes** na mesma linha:
   - `2/56 calls (4%)` — só 2 local?
   - `12% tokens local` — coerente com `T0:12.3k / total`
   - `░░░░░ 0% local` — bar progress mostra 0%
4. **Hint randomizado para mesma prompt**:
   - `resume /etc/os-release` → hint **T3 Opus conf 75%**
   - `resume /etc/hostname` → hint **T1 Haiku conf 85%**
   - `resume /etc/shells` → hint **T0 qwen3 conf 80%**
   - `resume /etc/timezone` → hint **T3 Opus conf 75%**
   - Mesma família de prompts ("resume /etc/X em 3 linhas") → 3 tiers diferentes sem padrão
5. **Hint auto-contraditório** em logs decisions_v2.jsonl: blocos com `tier:T0` mas `recommended_model: opus`
6. **`tokens-saved=0` sempre** no log persistido
7. **"court" + "<invoke" leak** antes de `local-summarizer(...)` em ~5 prompts (visual cruft)
8. **Stop digest NÃO renderiza** (tick file 3 bytes — hook silently broken pós-Wave 19/20)
9. **`_transcript T3=141 / T0=0`** apesar de 50 Ollama calls reais (transcript reader bias)

### Tracker evidence (CC probes):

- `_pushed.T0 = 32 calls / 7594 tokens_in / 4744 tokens_out` — funciona PARCIAL (32/50 = 64% capture)
- `_transcript.T3 = 141 calls` / `_transcript.T0 = 0` — atribui tudo a T3 (impossível com 50 Ollama spawns)
- `ls /tmp/*herd*` = **vazio** (em NENHUMA sessão alguma vez existiu)
- `grep -c "trackSpawn" ~/.claude/tools/router/post_tool_badge.js` = **2** (código existe runtime)

### Root cause hypothesis (a confirmar Day 1 recon):

**Hipótese A — PostToolUse não dispara para Agent/Task tool**: settings.json não mapeia Agent/Task ao hook, OR Claude Code v2.1.165 envia `tool_name` diferente de `"Agent"`/`"Task"` literal.

**Hipótese B — sessionId mismatch**: `sessionIdFrom(payload)` retorna null → `sanitizeSession` retorna `'global'` → escreve para `/tmp/mooter-herd-global.json` mas reader procura por sessionId real → mismatch silencioso.

**Hipótese C — payload schema mismatch**: `payload.tool_input.subagent_type` é o campo errado (CC pode estar a usar `task_name` ou outro).

CC Day 1 recon deve confirmar qual é (provavelmente A+B combinados).

---

## 1. Sub-features (5 critical)

### C1 — PostToolUse REALMENTE escreve herd file (CRITICAL)

**Root cause provável**: hipóteses A+B+C acima (CC investiga Day 1).

**Fix path**:

1. **Day 1 Recon (1h)**:
   - Adicionar TEMPORÁRIO `console.error()` em `recordSpawn` para stderr-log: `tool_name`, `subagent_type`, `session_id` recebidos em cada PostToolUse fire. Re-correr 3 prompts `resume /etc/X`. Inspeccionar stderr capture.
   - Verificar `~/.claude/settings.json` e `~/frugal/.claude/settings.json` — confirmar PostToolUse hook matcher actually covers Agent/Task tool name
   - Se sessionId é null → testar fallback `process.env.CLAUDE_CODE_SESSION_ID` em runtime real (não FleetView)
   - Se subagent_type é undefined → procurar nome real do campo no payload
2. **Day 1 Fix (1.5h)**:
   - Aplicar correcção baseada em findings (settings.json matcher OR payload field name OR sessionId fallback)
   - Remover console.error temporário
   - Adicionar **persistent guard**: se `recordSpawn` falha em escrever, fazer 1 stderr-log silent (não-fatal, formato compatible com Wave 13.1)
   - Add test que SIMULA payload real do Claude Code (não synthetic do FleetView)
3. **Verificar**:
   ```bash
   ls -la /tmp/mooter-herd-*.json
   cat /tmp/mooter-herd-$CLAUDE_CODE_SESSION_ID.json
   # esperado: { active: {}, cumulative: { "local-summarizer": { count: N, ... } }, peak_concurrent: K }
   ```

**Non-negotiables**:
- `subagent_tracker.js` snapshot() shape **unchanged** (apenas write path corrige)
- Idempotency por `spawn_id` mantida
- Zero PII no payload write

**Estimate**: 2.5h CC.

**Test**:
```javascript
// tools/router/__tests__/post_tool_badge.test.js
it('writes herd file on real Claude Code PostToolUse Agent payload', () => {
  const payload = { tool_name: 'Task', session_id: 'sess-123', tool_use_id: 'tu-1',
                    tool_input: { subagent_type: 'local-summarizer' } };
  // simulate hook process
  // assert /tmp/mooter-herd-sess-123.json exists with cumulative['local-summarizer'].count === 1
});
```

---

### C2 — Classifier stability para prompts similares (CRITICAL)

**Root cause**: heurística `classify.js` retorna tiers diferentes para prompts da MESMA familia ("resume /etc/X em 3 linhas"). Falta normalisation/canonical-form ANTES de aplicar regex tiers.

**Fix path**:

1. **Day 1 Recon (30 min)**:
   - Correr `node tools/router/classify.js "resume /etc/X em 3 linhas"` para 5 valores diferentes de X
   - Capturar `task_category`, `recommended_backend`, `confidence` de cada
   - Identificar qual feature está a oscilar (provavelmente `complexity`, `arch_signals`, ou TUNED_PROMOTE_T0 a fazer match parcial)
2. **Day 1 Fix (30 min)**:
   - **Não** alterar `classify.js` (P11 sha256 immutable)
   - Em vez disso: adicionar **normalisation layer** ANTES de classify (`tools/router/normalise_prompt.js` novo ficheiro):
     - Lower-case canonical form para classification only (original mantido para LLM)
     - Strip caminhos absolutos `/etc/X`, `/var/Y` → `<path>` placeholder
     - Strip números/dates → `<num>`
     - 3-linhas / 5-linhas → `<n>-linhas`
   - Chamar normaliser em `inject_context.js` ANTES de `classify.js`
   - `classify.js` permanece byte-identical (guardrail respeitado)
3. **Verificar**:
   ```bash
   # mesmo resultado para 5 paths diferentes
   node tools/router/inject_context.js --test-classify "resume /etc/foo em 3 linhas"
   node tools/router/inject_context.js --test-classify "resume /etc/bar em 3 linhas"
   # esperado: ambos T0 conf 80% (ou whatever tier estável)
   ```

**Non-negotiables**:
- `classify.js` sha256 = `7b01eb86...87762` **mantém-se idêntico**
- Normalisation só afecta classification path, nunca o prompt enviado ao LLM
- Zero regex em normaliser que precise update-router tuning (estável)

**Estimate**: 1h CC.

---

### C3 — Hint internal coherence (tier ↔ model sempre concorda) (CRITICAL)

**Root cause**: `inject_context.js` emite hint com `tier:T0 + recommended_model: opus` em alguns paths. Bloco interno tem 2 valores divergentes.

**Fix path**:

1. **Day 1 Recon (15 min)**:
   - `grep "recommended_model" tools/router/inject_context.js | head -20`
   - Identificar caminho que escreve hint contraditório
   - Provavelmente é fallback path quando classify retorna T0 mas algum override (Paulo pin, USER_OVERRIDE) força opus, e o tier não actualiza junto
2. **Day 1 Fix (15 min)**:
   - Definir **single function** `coerceHintCoherent(decision)` que valida:
     - Se `recommended_model.includes('opus')` → tier MUST be `'T3'`
     - Se `recommended_model.includes('sonnet')` → tier MUST be `'T2'`
     - Se `recommended_model.includes('haiku')` → tier MUST be `'T1'`
     - Se `recommended_model.includes('qwen|llama|deepseek|gemma|mistral')` → tier MUST be `'T0'`
   - Chamar antes de emit hint
   - Throw em test (não em runtime) se incoherent

**Estimate**: 30 min CC.

---

### C4 — 🏠 chip single source truth (CRITICAL)

**Root cause**: `statusline-multi.js buildLocalChip` está a concatenar 3 sources diferentes (calls count, tokens %, sparkline bar) sem ter uma fonte de verdade unificada.

**Fix path**:

1. **Day 1 Recon (15 min)**:
   - `grep -n "local" tools/router/statusline-multi.js | head -30`
   - Identificar as 3 fontes (provavelmente _pushed.T0/total, _transcript.T0/total, e calls-only counter)
   - Decidir qual é a verdade: **`_pushed` (Ollama trackCall real)** é canonical
2. **Day 1 Fix (15 min)**:
   - Refactor `buildLocalChip()` para retornar APENAS um valor:
     - Format proposto: `🏠 calls 32/50 (64%) · tokens 12% local`
     - OU mais compacto: `🏠 32/50 calls · 12% T0 tokens · 88% T3 tokens`
   - Remover bar `░░░░░░ 0% local` que não corresponde a nenhuma fonte
   - DOC: comentar `// SOURCE: _pushed (PostToolUse trackCall) — não usar _transcript`
3. **Verificar**:
   - Statusline real após 5 spawns local-summarizer mostra UM valor coerente
   - `git diff` mostra remoção do ASCII bar

**Estimate**: 30 min CC.

---

### C5 — Stop digest fires reliably (CRITICAL)

**Root cause**: tick file 3 bytes confirma Stop hook executou mas digest não foi escrito ao stderr/stdout (provavelmente regressão Wave 19/20 que perdeu o stderr fix Wave 13.1).

**Fix path**:

1. **Day 1 Recon (30 min)**:
   - `cat ~/.claude/settings.json` — confirmar Stop hook config aponta para `stop_hook.js`
   - `node tools/router/stop_hook.js < /dev/null` — testar standalone, capturar output
   - `grep -A 5 "process.stdout.write\|process.stderr.write" tools/router/stop_hook.js | head`
   - Comparar com Wave 13.1 fix (stderr fd) — verificar não foi reverted
2. **Day 1 Fix (30 min)**:
   - Restaurar Wave 13.1 stderr write se foi removido
   - Adicionar Wave 19 Day 4 PER-TASK BREAKDOWN se ausente
   - Adicionar test que assert `stop_hook` writes to stderr (fd 2) com pelo menos linha `🐮 Mooter session report`
3. **Verificar**:
   - Após `/quit` no CC, terminal mostra digest completo (TOKENS BY TIER + CHOICE REASONS + HERD + SAVINGS + PER-TASK BREAKDOWN)

**Estimate**: 1h CC.

---

## 2. Sequência (~5h autonomous, 1 PR consolidado)

### Day 1 — Recon + 5 fixes (~5h)

| Step | Time | Action |
|---|---|---|
| 1 | 30 min | Recon completo (5 hipóteses C1-C5, capture stderr/grep evidence em `WAVE21_DAY1_RECON.md`) |
| 2 | 2.5h | C1 PostToolUse herd writer fix (incluir test com real CC payload) |
| 3 | 1h | C2 normaliser layer antes classify |
| 4 | 30 min | C3 coerceHintCoherent + emit guard |
| 5 | 30 min | C4 buildLocalChip single source |
| 6 | 1h | C5 stop_hook stderr restore + PER-TASK BREAKDOWN restore |
| 7 | 30 min | Tests (1 per fix mínimo) |
| 8 | 15 min | classify.js sha256 check (P11 immutable verify) |
| 9 | 30 min | PR squash → branch `wave21-critical-fixes` → dev |
| 10 | 30 min | `final-reviewer` T2 Sonnet review |
| 11 | 5 min | Tag dev `v1.11.0-coherence-critical-dev` |

**Total**: ~6.5h (5h core + 1.5h overhead). Promote prod blocked até E2E re-validation Cowork PASS.

---

## 3. Non-negotiables (verificação em cada commit)

| # | Item | Como verificar |
|---|---|---|
| 1 | `classify.js` byte-identical | `sha256sum tools/router/classify.js` em cada commit (esperado: `7b01eb86...87762`) |
| 2 | Wave 19 token tracker shape | `node -e "console.log(Object.keys(require('./tools/router/token_tracker.js').snapshot('x')))"` antes/depois |
| 3 | Wave 13 subagent_tracker shape | mesmo, mas `subagent_tracker.snapshot()` keys |
| 4 | Zero PII | grep para prompts/strings no que `recordSpawn` escreve |
| 5 | Zero hub touch | `git diff --name-only main` zero ficheiros em `hub/` |
| 6 | UserPromptSubmit hook intact | corre `inject_context.js < /dev/null` smoke |
| 7 | "mooter →" branding (Wave 20.A) | grep `frugal recommends` retorna 0 |

---

## 4. Definition of Done (Wave 21)

1. ✅ C1 — `/tmp/mooter-herd-<sid>.json` é escrito após PostToolUse Agent/Task (verify ls + cat)
2. ✅ C1 — Statusline 🐄 chip mostra `N/M/peakK` reais após spawns (não `0/0/peak0`)
3. ✅ C1 — 🐄 chip aparece **UMA vez** na statusline (não duas linhas duplicadas)
4. ✅ C2 — 3 prompts "resume /etc/X em 3 linhas" diferentes → mesmo tier hint (estável)
5. ✅ C3 — Zero hints com `tier:T0 + opus` no decisions_v2.jsonl
6. ✅ C4 — 🏠 chip mostra UM valor coerente (não 3 conflituantes)
7. ✅ C5 — Stop digest aparece após `/quit` com TODAS secções (TOKENS BY TIER + CHOICE REASONS + HERD + SAVINGS + PER-TASK BREAKDOWN)
8. ✅ classify.js sha256 = `7b01eb86...87762`
9. ✅ Tag prod `v1.11.0-coherence-critical` em main
10. ✅ Notion sub-page Wave 21 + archive findings + SYNC.md update

---

## 5. Open issues postponed para Wave 22 (não block friends-launch)

| # | Bug | Wave 22 estimate |
|---|---|---|
| #6 | Branding "frugal" leftover (symlinks, dezenas .js) | 4h |
| #10 | "court" + "<invoke" visual cruft antes local-summarizer | 1h |
| #11 | Tempos negativos display bug (clock skew) | 30 min |
| #12 | tokens-saved=0 sempre | 1h |
| #13 | Pastor "trained on 8 decisions" stale | 1h |
| #14 | Status verbal randomizado JJ vibe | (decide se charm vale o noise) |
| #15 | Cache file 3-byte ghost (statusline tick) | 30 min |
| #3 | `_transcript T0=0 T3=100%` reader bias | 2h (precisa redesign transcript parser) |

Total Wave 22 estimate: ~10-12h. Pode ser split em Wave 22A (branding) + Wave 22B (display polish) + Wave 22C (transcript honest).

---

## 6. Master prompt para CC (paste when ready)

```
Inicia Wave 21 Critical Coherence Fixes conforme docs/strategy/WAVE21_CRITICAL_FIXES_KICKOFF.md.

Pré-flight: Wave 20 v1.10.1+ EM PROD. Paulo correu audit que revelou 5 mentiras estruturais críticas: 🐄 herd file NUNCA escrito (50 spawns confirmados), classifier randomizado para prompts similares, hints contraditórios tier↔model, 🏠 chip com 3 valores conflituantes, Stop digest silent broken.

Diagnóstico fonte: docs/strategy/WAVE21_COHERENCE_AUDIT_DIGEST.md (sessão 4f3982ce com evidência: _pushed.T0=32 calls / _transcript.T3=141 / ls /tmp/*herd* vazio / grep trackSpawn=2 em runtime).

Scope: 1 PR consolidado com 5 fixes — TODOS critical (C1 herd writer fix + C2 classifier stability + C3 hint coherence + C4 🏠 single source + C5 stop digest restore).

Lê PRIMEIRO:
  - docs/strategy/WAVE21_CRITICAL_FIXES_KICKOFF.md inteiro
  - docs/strategy/WAVE21_COHERENCE_AUDIT_DIGEST.md (TL;DR + Step 5 evidência tracker)
  - tools/router/post_tool_badge.js (linhas 192-214 recordSpawn — onde 🐄 deveria escrever)
  - tools/router/subagent_tracker.js (trackSpawn/trackComplete/writeState — shape para preservar)
  - tools/router/statusline-multi.js (buildLocalChip — 🏠 chip três sources problem)
  - tools/router/inject_context.js (UserPromptSubmit hint emit — hint coherence problem)
  - tools/router/classify.js (P11 sha256 7b01eb86...87762 — NUNCA tocar)
  - tools/router/stop_hook.js (Wave 13.1 stderr + Wave 19 Day 4 expansion — restore se regredido)
  - ~/.claude/settings.json (PostToolUse hook matcher — confirmar Agent/Task coverage)

Non-negotiables (verificar em cada commit):
  - classify.js byte-identical (sha256 P11 GUARD)
  - Wave 19 token_tracker.snapshot() shape unchanged
  - Wave 13 subagent_tracker.snapshot() shape unchanged
  - Wave 20.A "mooter →" branding mantido (grep "frugal recommends" = 0)
  - Zero PII em payload writes
  - Zero hub touch
  - UserPromptSubmit hook não parte (smoke test bash)
  - Tests router + 5 new (1 por sub-feature)

Sequência (~6.5h autonomous):

Day 1 Recon (30 min):
  1. Adicionar console.error TEMPORÁRIO em recordSpawn para capturar tool_name/subagent_type/session_id reais em runtime
  2. Re-correr 3 prompts `resume /etc/foo em 3 linhas` — capturar stderr
  3. Inspeccionar ~/.claude/settings.json PostToolUse matcher
  4. Confirmar hipótese A/B/C (settings vs payload schema vs sessionId)
  5. Documentar findings em docs/strategy/WAVE21_DAY1_RECON.md ANTES de fix

Day 1 Fixes (4.5h):
  6. C1 — Fix recordSpawn writer baseado em recon + test com REAL CC payload (não synthetic)
  7. C2 — Criar tools/router/normalise_prompt.js + chamar em inject_context.js ANTES classify
  8. C3 — coerceHintCoherent() em inject_context.js + emit guard
  9. C4 — Refactor buildLocalChip single source `_pushed` + remover ASCII bar misleading
  10. C5 — stop_hook stderr restore + PER-TASK BREAKDOWN se ausente
  11. Tests 5 new (1 per fix; C1 test simula CC payload real)
  12. classify.js sha256 check + Wave 19/13 snapshot shape check
  13. Remover console.error temporário Day 1.1
  14. PR squash → branch wave21-critical-fixes
  15. final-reviewer T2 Sonnet

Tag dev v1.11.0-coherence-critical-dev. NÃO promote prod até Cowork re-validation PASS (5 spawns + verificar 🐄 N>0 + 🏠 single value + Stop digest fires).

Reporta WAVE21_DAY_X_FINDINGS.md por etapa. Documenta decisões críticas (e.g. "PostToolUse não disparava porque settings.json matcher era 'Bash' não 'Task' — adicionei matcher Agent + Task").

Cost target: ~$0.50-1.00 CC (5h autonomous Sonnet pode reduzir). Save evidência tracker file content como artifact em findings doc.
```

---

## 7. E2E Re-validation gate (post-merge, Paulo executa)

Após CC abre PR + Cowork mergeu dev + Paulo updates runtime (`/mooter-update` skill):

### Sequência Paulo WSL:

```bash
# 1. Pull dev + sync runtime
cd ~/frugal && git fetch origin && git checkout dev && git pull origin dev
# (assumindo runtime symlink ~/.claude → frugal canonical)

# 2. Verify Wave 21 fixes runtime
grep -c "coerceHintCoherent\|normalisePrompt" ~/.claude/tools/router/inject_context.js
# esperado: ≥ 2

# 3. Fresh CC session
cd ~ && claude
```

### Dentro do CC:

```
# 5 prompts identicos para testar classifier stability + herd writer
resume o ficheiro /etc/os-release em 3 linhas
resume o ficheiro /etc/hostname em 3 linhas
resume o ficheiro /etc/timezone em 3 linhas
resume o ficheiro /etc/shells em 3 linhas
resume o ficheiro /etc/group em 3 linhas
```

Espera cada um terminar. Observar statusline.

### Após 5 prompts, OBSERVA statusline:

| Chip | Pre-Wave-21 (broken) | Post-Wave-21 esperado |
|---|---|---|
| 🐄 herd | `🐄×0` top + `🐄 0/0/peak0` bottom | `🐄 5/5/peak1` (uma vez só) |
| 🪙 T0 tkns | `T0:12.3k` (under-count) | `T0:~7k` coerente |
| 🏠 local % | `2/56 calls (4%) · 12% tokens local · 0% local` (3 mentiras) | `🏠 5/5 calls (100%) · ~70% tokens local` (1 valor) |
| Hint top of prompt | aleatório (T0/T1/T3) | mesmo tier 5×5 (T0 esperado) |
| Stop digest | NÃO aparece | aparece com TODAS secções |

### `/quit` no CC, depois bash:

```bash
ls -la /tmp/mooter-herd-*.json
cat /tmp/mooter-herd-$(echo $CLAUDE_CODE_SESSION_ID).json

# esperado: ficheiro existe + cumulative['local-summarizer'].count === 5
```

### Stop digest visible ANTES do quit terminar:

```
🐮 Mooter session report — Xm Ys
  TOKENS BY TIER
  T0 (local ollama qwen3:30b)   ~7k tokens · 5 calls · $0.00
  T1 ...
  T2 ...
  T3 ...
  
  CHOICE REASONS
  5× T0 → classify_score>0.80 (delegated to local-summarizer)
  
  HERD
  local-summarizer × 5 · avg Xs · peak concurrent: 1
  
  SAVINGS
  Total saved vs all-Opus: $X.XX (Y% reduction)
  
  PER-TASK BREAKDOWN
  Task 1: "resume /etc/os-release" → local-summarizer (qwen3:30b T0) · ~1.5k→0.3k · classify_score=0.80
  Task 2: ...
```

### Gate decision:

| Result | Action |
|---|---|
| ✅ TODOS 5 chips OK + ficheiro herd + Stop digest | Promote prod tag `v1.11.0-coherence-critical` + Friends-launch GO |
| ⚠️ 4/5 OK | Avalia critical vs polish, decide hold OR ship-with-known-bug |
| ❌ < 4/5 OK | Hold prod + Wave 21 Day 2 follow-up |

---

**Composed by Cowork, 2026-06-05 noite. 5 critical fixes pré-friends-launch.
~5h CC autonomous. Tag v1.11.0-coherence-critical. Friends-launch GO após este
wave + E2E re-validation PASS.**
