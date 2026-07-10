# Wave 21 — Day 1 Recon Findings

> Recon executado ANTES de qualquer fix (conforme kickoff). Toda a evidência é
> on-disk verificável ou reprodução directa do hook. Sessão de recon:
> `f7ecf0c3-d911-4397-a68e-8ed99b9fc044` (2026-06-05).

## TL;DR (3 linhas)
- **C1 root cause = Hipótese A confirmada**: `~/.claude/settings.json` PostToolUse matcher é `"Bash"` apenas. O hook `post_tool_badge.js` NUNCA recebe payloads `Agent`/`Task` → `recordSpawn` retorna `null` sempre → herd file nunca escrito. O código (`recordSpawn` + `subagent_tracker`) está **correcto** (provado por simulação). Hipóteses B (sessionId) e C (payload schema) **descartadas**.
- **C2/C3/C4 confirmados** com causa precisa (path-keyword bleed; budget_cap deixa model stale; 3 sources no 🏠).
- **C5 NÃO é regressão de código**: `buildSessionReport` + stderr write + PER-TASK BREAKDOWN estão todos presentes e a funcionar. O digest não dispara porque o opt-in `session_report_enabled` nunca foi activado (`~/.mooter/preferences.json` **não existe**).

---

## C1 — Herd file nunca escrito

### Evidência
```
~/.claude/settings.json → PostToolUse: [ { "matcher": "Bash", ... post_tool_badge.js } ]
                          ^^^^^^^^^^^^^^^^^^^^ só Bash. Sem Agent/Task.
```

Simulação do hook com payload REAL do Claude Code (não synthetic):
```
# tool_name=Task → herd file ESCRITO correctamente:
echo '{"tool_name":"Task","session_id":"S","tool_use_id":"tu1","tool_input":{"subagent_type":"local-summarizer"}}' | node post_tool_badge.js
→ /tmp/mooter-herd-S.json = {"cumulative":{"local-summarizer":{"count":1,...}},"peak_concurrent":1}  ✅

# tool_name=Bash → recordSpawn retorna null (correcto), sem herd file:
echo '{"tool_name":"Bash",...}' | node post_tool_badge.js  → sem ficheiro  ✅
```

### Conclusão
O código `recordSpawn` (post_tool_badge.js:192-214) lê os campos certos
(`tool_name`, `tool_input.subagent_type`, `session_id`, `tool_use_id`) e o
tracker persiste o ficheiro com o shape esperado. **A ÚNICA falha é o matcher
do settings.json não cobrir Agent/Task**, pelo que o hook nunca corre depois de
um spawn. O comentário em post_tool_badge.js:145-148 ("no settings.json change —
shared-config guardrail respected") assumiu, erradamente, que PostToolUse dispara
para todas as ferramentas; com matcher `"Bash"` não dispara.

### Fix
1. `~/.claude/settings.json` → matcher PostToolUse passa a `"Bash|Task|Agent"`.
2. `recordSpawn` ganha um **persistent guard**: se o write falhar, 1 stderr-log
   silent (não-fatal, compatível com Wave 13.1) — para nunca mais falhar em
   silêncio total.
3. Test que simula o payload REAL do Claude Code (`tool_name:'Task'`).

`subagent_tracker.snapshot()` shape **inalterado** (apenas o write path é destravado).

---

## C2 — Classifier não-determinístico para prompts da mesma família

### Evidência
```
node classify.js "resume o ficheiro /etc/<X> em 3 linhas":
  /etc/os-release  → architecture_or_critical | T3 | opus   | 0.75   ← OUTLIER
  /etc/hostname    → simple_transform_or_explain | T1 | haiku | 0.85
  /etc/timezone    → simple_transform_or_explain | T1 | haiku | 0.85
  /etc/shells      → simple_transform_or_explain | T1 | haiku | 0.85
  /etc/group       → simple_transform_or_explain | T1 | haiku | 0.85
```

### Causa
O path absoluto carrega keywords que disparam categorias erradas: `os-release`
contém **"release"** (keyword de arquitectura/deploy). O classifier vê "release"
e sobe para `architecture_or_critical`. Mesmo padrão afecta paths com "security",
"migration", etc. embebidos.

### Fix (sem tocar classify.js — P11 immutable)
`tools/router/normalise_prompt.js` (novo): canonical-form **só para
classificação** (o prompt enviado ao LLM mantém-se original):
- strip de paths absolutos `/etc/foo`, `/var/bar` → `<path>`
- strip de números/datas → `<num>`
- `3 linhas` / `5-linhas` → `<n> linhas`
- lower-case
Chamado em `inject_context.js` ANTES de `classify()`. classify.js byte-identical.

---

## C3 — Hint auto-contraditório (tier ↔ model)

### Evidência (live, vista no contexto desta própria sessão de recon)
```
<router-hint>
  tier: T0
  recommended_model: claude-opus-4-6
  suggested_subagent: model-architect
  max_tier: T0
  escalation: budget_cap
```
`tier:T0` + `opus`/`model-architect` são mutuamente exclusivos.

### Causa exacta
`inject_context.js:940-949` — `applyBudgetCap()` baixa `decision.tier` (ex. T3→T0)
mas **NÃO** actualiza `recommended_model` / `recommended_backend` /
`suggested_subagent`. O mesmo padrão em `zen_cap` (linha ~998). O model fica
stale do classify/safety-boost enquanto o tier desce por cost-control.

> Nota: `decisions_v2.jsonl` é escrito em inject_context.js:894, **ANTES** do
> budget_cap (940). Por isso já tem **0** registos `tier:T0 + opus` (verificado:
> 11 registos T0, 0 com opus). A incoerência vive **só no hint emitido** (linha
> 1268, pós-cap). DoD #5 está satisfeito ao nível do decisions_v2; o fix é no
> hint emitido.

### Decisão crítica de arquitectura (DESVIO do kickoff — documentado)
O kickoff C3 propôs coerência **model→tier** ("se model=opus → tier=T3"). Aplicar
isso ao caso real (budget_cap) **desfaria o cap** e enviaria a tarefa para Opus —
o oposto do objectivo de cost-control do Paulo. A causa dominante observada é
budget_cap/zen_cap a baixar o **tier** (autoritativo). Logo o fix correcto é
**tier-authoritative**: o `coerceHintCoherent(decision)` deriva
backend/model/subagent do **tier final**. Isto:
- respeita budget_cap / zen_cap (T0 ⇒ qwen3 + local-summarizer),
- mantém coerência em pins (já põem tier+model juntos), safety_floor, arbiter.
Um campo só é reescrito quando **discorda** do tier (preserva especializações
tier-consistentes, ex. local-transformer em T0, final-reviewer em T3).

### Fix
`coerceHintCoherent(decision)` chamado imediatamente antes da emissão do hint
(inject_context.js:~1268), cobrindo hint + tier-badge. Helper `isHintCoherent()`
exportado para o test (assert, não throw em runtime).

---

## C4 — 🏠 chip com 3 valores conflituantes + 🐄 duplicado

### Evidência (statusline real Paulo)
```
🏠 2/56 calls (4%) · 12% tokens local · ░░░░░░░░░░ 0% local
   └ homeChip(calls)   └ homeChip(token%)   └ localShareChip (ASCII bar)
```
Três fontes diferentes na MESMA linha (statusline-multi.js:909-915 + 804-810,
ambos em line2 @ 921-936):
- `2/56 calls` ← `ctx.counts.T0`/`ctx.total` (contagem de decisions.log)
- `12% tokens local` ← `token_tracker.snapshot()` (tokens)
- `░░░ 0% local` ← `localBar(localCloudSplit(ctx.recent))` (sparkline, últimos 10)

Adicionalmente, **🐄 aparece 2×**:
- line1: `appendHerd` → `herdChip` → `🐄×N` (statusline-multi.js:782)
- line2: `buildHerdsChip` → `🐄 N/M/peakK` (statusline-multi.js:919)

### Fix
1. `buildLocalChip(tokSnap)` — fonte ÚNICA = `token_tracker.snapshot()` (que já
   reconcilia `_pushed`+`_transcript`). Calls e token% derivam do MESMO snapshot,
   coerente com o 🪙 chip. Sem chip fabricado quando `totalCalls===0`.
2. Remover `localShareChip` (a barra `░░░ 0% local` enganadora) de line2.
3. Remover o `appendHerd` de line1 (statusline-multi.js:782) — fica só o
   `buildHerdsChip` (mais rico: active/total/peak). 1-line layout (linha 557)
   intacto. Resolve DoD #3 (🐄 uma vez só).
`token_tracker.snapshot()` shape inalterado (Wave 19 non-negotiable).

---

## C5 — Stop digest não dispara

### Evidência
```
~/.mooter/preferences.json → NÃO EXISTE
stop_hook.js:468  reportOn = sessionReportEnabled(prefs)  → false (prefs={})
stop_hook.js:467  enabled  = mooCardEnabled(prefs)        → false
```
`buildSessionReport()` testado directamente: renderiza TODAS as secções
correctamente (TOKENS BY TIER · CHOICE REASONS · PER-TASK BREAKDOWN · HERD ·
SAVINGS). O stderr write (linha 489, Wave 13.1) **está presente**. O PER-TASK
BREAKDOWN (Wave 20.F) **está presente**.

### Conclusão honesta
C5 **não é uma regressão de código**. O digest está completo e correcto. Nunca
disparou porque é **opt-in** (`session_report_enabled`, default OFF) e o ficheiro
de preferências nunca foi criado. Grep confirma que nada em `tools/router/`
escreve `session_report_enabled`.

### Fix
1. `SessionStart.sh` self-heals: se `~/.mooter/preferences.json` não existir,
   cria-o com `session_report_enabled: true` + `herd_visibility: "standard"`
   (digest passa a default-on; o user pode desligar editando o ficheiro).
2. Criar o ficheiro agora para o runtime do Paulo (estado de user, reversível).
3. Test que assert `buildSessionReport` escreve o header `🐮 Mooter session
   report` + as 5 secções.

---

## Non-negotiables — baseline verificada (pré-fix)
| Item | Estado pré-fix |
|---|---|
| `classify.js` sha256 | `7b01eb86…87762` ✅ (não tocar) |
| `token_tracker.snapshot()` shape | `{T0..T3}:{calls,tokens_in,tokens_out,real}` — preservar |
| `subagent_tracker.snapshot()` shape | `{active_count,active_local,active_cloud,active,by_agent,peak_concurrent,cumulative}` — preservar |
| `grep "frugal recommends"` | 0 (Wave 20.A branding intacto) |
| Hub touch | 0 ficheiros em `hub/` |
