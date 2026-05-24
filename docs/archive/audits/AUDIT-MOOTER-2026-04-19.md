# AUDIT-MOOTER — 2026-04-19

> Full-system audit produzida por model-architect (Opus 4.7, 1M). Rollback anchor: commit `fc2c991360c4acffe2a4322d2d1b8aed82ac620b`. Nenhum fix aplicado — este relatório é *read-only* até aprovação do Paulo.

---

## 1 · Executive Summary

Auditoria de 8 camadas revelou **3 CRITICAL, 6 HIGH, 5 MEDIUM, 3 LOW** findings. A mensagem em uma linha: **o router funciona, mas o statusline, a memória e o schema de mode não concordam com o que o classifier realmente faz**. Há uma dissonância estrutural entre três sítios distintos onde o router vive (`~/.claude/tools/router/`, `~/.claude/hooks/`, `frugal/tools/router/`) — *cada um com a sua cópia* de ficheiros-chave, e nenhum processo automático garante que todas estão sincronizadas.

**Top-3 issues críticos**:

1. **CRITICAL-1 · Mode schema fork** — `mooter-mode.js` escreve `{mode: "beast"}` (string) enquanto `mooter-autopilot.js` escreve `{beast_mode: true}` (boolean flag). O estado actual de `.mooter-mode.json` tem apenas `beast_mode: true` — a statusline mostra "BEAST" activo, mas `inject_context.js` ignora esse schema por completo e NÃO força T3. Resultado: user vê "BEAST active" e paga Opus como se estivesse em beast, mas o classifier continua a rotear normalmente. **Mentira visual directa.**
2. **CRITICAL-2 · Duplicated-file drift** — `classify.js`, `inject_context.js`, `arbiter.js`, `savings-tracker.js`, `pricing.js`, `gsd-statusline.js`, `PostToolUse.js`, `exec-logger.js` existem em 2-3 sítios e todos divergem. Edits ao ficheiro "canonical" versionado em `frugal/` não propagam ao runtime em `~/.claude/`. Risco de correr código antigo sem aviso.
3. **CRITICAL-3 · Arbiter metrics in-memory only** — `/metrics` reporta `arbiter.calls_total: 0` apesar de `decisions.log` ter 80 eventos `arbiter_call`. O objecto `ARBITER_METRICS` é volatile na memória do tracker; qualquer restart zeros. Qualquer narrativa construída em cima destes números é opaca.

**Recomendação next step**: aprovar remediation plan (Secção 5) e começar pelos 3 CRITICAL. Todos são fixes pequenos (<30 min cada) mas têm impacto desproporcionado porque fecham a principal dissonância entre *o que se mostra* e *o que aconteceu*.

---

## 2 · Inventory

| Camada | Componente | Activo (wired via settings.json) | Legacy / Cópia não-wired | Status |
|---|---|---|---|---|
| 1 | statusline | `frugal/tools/router/gsd-statusline.js` | `~/.claude/hooks/gsd-statusline.js` (difere) | DRIFT |
| 1 | UserPromptSubmit hook | `~/.claude/tools/router/inject_context.js` | `~/.claude/hooks/inject_context.js` (difere); `frugal/tools/router/inject_context.js` (difere) | **TRIPLE-DRIFT** |
| 1 | turn-header hook | `~/.claude/hooks/frugal-turn-header.js` | `~/.claude/tools/router/frugal-turn-header.js`; `frugal/tools/router/frugal-turn-header.js` | DRIFT |
| 1 | PostToolUse | `~/.claude/hooks/PostToolUse.js` | `frugal/tools/router/PostToolUse.js` (difere) | DRIFT |
| 1 | exec-logger | `~/.claude/hooks/exec-logger.js` | `frugal/tools/router/exec-logger.js` (difere) | DRIFT |
| 2 | classifier | `~/.claude/tools/router/classify.js` | `frugal/tools/router/classify.js` (difere) | DRIFT |
| 2 | arbiter | `~/.claude/tools/router/arbiter.js` | `frugal/tools/router/arbiter.js` (difere) | DRIFT |
| 5 | mode writer | `frugal/tools/router/mooter-mode.js` (invocado pelas skills) | `mooter-autopilot.js` (escreve schema diferente) | **SCHEMA-FORK** |
| 5 | mode state file | `~/.claude/tools/router/.mooter-mode.json` | `~/.claude/tools/router/.frugal-mode.json` (legacy fallback) | OK |
| 6 | savings tracker | `~/.claude/tools/router/savings-tracker.js` | `frugal/tools/router/savings-tracker.js` (difere) | DRIFT |
| 6 | pricing | `~/.claude/tools/router/pricing.js` | `frugal/tools/router/pricing.js` (difere) | DRIFT |
| 3 | execution log | `~/.claude/hooks/execution.log` (3235 linhas) | — | OK |
| 3 | decisions log | `~/.claude/tools/router/decisions.log` (28673 linhas; 817 classified, 26684 tester, 80 arbiter, 104 option-a) | — | OK |
| 3 | last-subagent | `~/.claude/tools/router/last-subagent.json` (30s TTL) | — | OK |
| 7 | global doctrine | `~/.claude/CLAUDE.md` | `frugal/CLAUDE.md` (sobrepõe per-project) | OK |
| 7 | memory index | `~/.claude/projects/.../memory/MEMORY.md` | — | OK |
| 8 | landing | `frugal/landing/` (só README.md) | `frugal/mooter-design-updated/` (untracked, vazio ou poucos ficheiros) | INCOMPLETE |

Ficheiros `.bak` e `.sync-bak` detectados (não auditados mas sinalizados): `inject_context.js.sync-bak`, `classify.js.bak` (normal, criado por `update-router.js`).

---

## 3 · Findings

### Layer 1 — Active vs Legacy

#### [CRITICAL] F1.1 · Triple-location file drift

- **Location**: `~/.claude/tools/router/`, `~/.claude/hooks/`, `frugal/tools/router/`
- **Observation**: `diff -q` confirma que **todos** os ficheiros críticos divergem entre cópias: `classify.js`, `inject_context.js`, `arbiter.js`, `gsd-statusline.js`, `PostToolUse.js`, `exec-logger.js`, `savings-tracker.js`, `pricing.js`. Exemplo: editar `frugal/tools/router/classify.js` (versionado) não afecta o runtime que carrega `~/.claude/tools/router/classify.js` via `inject_context.js` linha 562 (`path.join(__dirname, 'classify.js')`).
- **Expected**: single source of truth — runtime carrega exactamente o ficheiro versionado, ou há processo automático de sync.
- **Evidence**: output de `diff -q` mostrou 7/7 pares divergentes.
- **Blast radius**: 8 ficheiros × 3 localizações = até 24 pontos de drift. Cada edit "em frugal" tem risco de não entrar em efeito.
- **Fix proposal**: decidir canonical location (proposta: `~/.claude/tools/router/` para runtime, com `frugal/tools/router/` como repo versionado de onde um script `sync-router.sh` copia após `git pull`). Documentar em INFRA.md. Remover cópias em `~/.claude/hooks/` (excepto `exec-logger.js` e `PostToolUse.js` que estão wired aí por `settings.json`).

#### [HIGH] F1.2 · Memory outdated about canonical statusline

- **Location**: `~/.claude/projects/C--Users-Paulo-Loureiro-frugal/memory/feedback_dual_statusline_files.md`
- **Observation**: Memória marca "dual statusline files need sync" mas settings.json confirma canonical é `frugal/tools/router/gsd-statusline.js`. O aviso é correcto mas a action item não foi fechada.
- **Expected**: memória remover o "proponha dedup" ou evoluir para "canonical = frugal/tools/router/; legacy em ~/.claude/hooks/gsd-statusline.js pode ser eliminada".
- **Evidence**: settings.json linha 149 aponta apenas para `frugal/tools/router/gsd-statusline.js`.
- **Fix proposal**: actualizar a memória após CRITICAL-2 estar resolvido.

### Layer 2 — Routing Core

#### [HIGH] F2.1 · Router-logic.md tier threshold spec ≠ implementation

- **Location**: `frugal/.claude/rules/router-logic.md` vs `frugal/tools/router/classify.js:410-640`
- **Observation**: `router-logic.md` afirma "Tier thresholds (fixed): T0 confidence ≤ 0.3, T1 ≤ 0.5, T2 ≤ 0.7, T3 > 0.7". Em `classify.js`, o tier é escolhido por category+risk signals, não por confidence thresholds; a confidence é atribuída **depois** do tier. Um evento pode ter tier=T3 + confidence=0.75 (válido), mas também T0 + confidence=0.9 (viola o spec).
- **Expected**: spec ou enforca o mapping confidence→tier, ou descreve a implementação real (category-driven).
- **Evidence**: classify.js linhas 572 ("T3 when high>0"), 584 ("T2 when med>0"), 590 ("T0 when triv>0 or short").
- **Fix proposal**: reescrever a secção "Tier thresholds (fixed)" para "Tier selection is category-driven; confidence is a derived quality signal per-category".

#### [MEDIUM] F2.2 · `gemma4:e4b` as general T0 default without availability check

- **Location**: `classify.js:148` e `pricing.js:55`
- **Observation**: `MODELS.ollama_general = 'gemma4:e4b'`. Este model NÃO é standard Ollama (Gemma 3 é). Se não está instalado, qualquer prompt T0-general vai falhar no `ollama_call_node.js`.
- **Expected**: `bestOllamaT0()` em `inject_context.js:466` já faz fallback, mas `classify.js` não.
- **Evidence**: decisions.log sample mostra `"model":"gemma4:e4b"` em execução com `success:false`. (`tester_execution`, 2026-04-19T20:20:16.025Z)
- **Fix proposal**: em `classify.js:148`, substituir `'gemma4:e4b'` por `process.env.ROUTER_OLLAMA_GENERAL || 'qwen2.5:3b'` (fallback seguro); deferir a selecção do best-general para o hook via `FRUGAL_HW_RECOMMENDED_T0`.

#### [MEDIUM] F2.3 · Haiku model ID inconsistent across files

- **Location**: `classify.js:191` (`'claude-haiku-4-5'`), `arbiter.js:84` (`'claude-haiku-4-5-20251001'`), `PostToolUse.js:45` (`'claude-haiku-4-5'`)
- **Observation**: três IDs diferentes circulam. Pricing map (`pricing.js`) tem as duas chaves (`claude-haiku-4-5` e `claude-haiku-4-5-20251001`) para evitar crash, mas o "canonical ID" não está fixado.
- **Expected**: constante partilhada `HAIKU_MODEL_ID`.
- **Fix proposal**: adicionar em `patterns.js` (ou novo `model-ids.js`) uma constante exportada, importada por todos os consumers.

#### [LOW] F2.4 · Arbiter doesn't set `latency_ms` on decision object

- **Location**: `arbiter.js:298` (log) vs `inject_context.js:1104` (consumer)
- **Observation**: `arbiter.js` regista `duration_ms` na log mas não expõe no objecto retornado (`arbitrate()`). `inject_context.js:1104` lê `decision.arbiter.latency_ms || 0` → sempre 0. `/metrics` reporta `arbiter.avg_latency_ms = 0` por isso.
- **Fix proposal**: em `arbiter.js:309`, adicionar `return { ...decision, cached: false, latency_ms: durationMs }`.

### Layer 3 — Execution Telemetry

#### [HIGH] F3.1 · Degraded mode (`decisions_log`) em exec-logger.js é mentira por design

- **Location**: `~/.claude/hooks/exec-logger.js:225-262`
- **Observation**: Quando rolling avg de resolution time ultrapassa 200ms, `exec-logger` flipa para `mode: 'decisions_log'` — passa a registar **recommended_model** em vez do **actual model** lido do transcript. Isto significa `execution.log` passa a mentir silenciosamente quando o sistema está lento. O próprio comentário reconhece: "MODE=decisions_log uses recommended_model (NOT actual)".
- **Expected**: logar claramente o mode em cada linha (já o faz, `mode=transcript_scan|decisions_log`) MAS também marcar esse model como `model=<recommended>:advisory`. Downstream (statusline, audit) só conta linhas com mode=transcript_scan.
- **Evidence**: `execution.log` tail actual mostra 100% `mode=transcript_scan` (saudável). Mas a ameaça é invisível até activar.
- **Fix proposal**: em `exec-logger.js:278`, renomear prefix `model=` para `model_actual=` quando `mode=transcript_scan`, e `model_advisory=` quando `mode=decisions_log`. Downstream parsers ajustados.

#### [MEDIUM] F3.2 · Duplicated helper code entre `exec-logger.js` e `PostToolUse.js`

- **Location**: `~/.claude/hooks/exec-logger.js:53-172` e `~/.claude/hooks/PostToolUse.js:40-159`
- **Observation**: `subagentTypeToModel`, `detectExternalModel`, `scanJsonlForToolUse`, `tailLines`, `getModelFromTranscript` aparecem quase idênticos em ambos. Drift risk: se um corrige um bug (ex: adiciona mapping para subagent novo), o outro fica inconsistente → emoji visual (PostToolUse) e log (exec-logger) discordam sobre o mesmo Bash call.
- **Fix proposal**: extrair para `~/.claude/hooks/_model-resolver.js` (CommonJS), `require()` em ambos.

#### [LOW] F3.3 · `last-subagent.json` 30s TTL stomp risk

- **Location**: `PostToolUse.js:214-222`
- **Observation**: Se um subagent foi spawned aos 19:50:00, e aos 19:50:29 o user abre sessão nova e faz Bash call, essa Bash call será marcada com o model do subagent anterior (stale fallback). O transcript scan devia ganhar sobre last-subagent; ordem actual é: (1) transcript (2) last-subagent (3) external-cmd detect (4) subagent_type de Agent call directa. Está tecnicamente correcto — last-subagent só entra se transcript falhou. Não há bug exercitável actualmente (last-subagent.json mostra ts de 19:56 → bem mais antigo que 30s agora).
- **Fix proposal**: nenhuma — aceitable trade-off. Documentar.

### Layer 4 — Display & Feedback Loops

#### [CRITICAL] F4.1 · Statusline MODE badge lies when autopilot is on

- **Location**: `frugal/tools/router/gsd-statusline.js:316-323` vs `~/.claude/tools/router/inject_context.js:790-832`
- **Observation**: statusline função `getRouterMode()` lê `{beast_mode: true}` e retorna `{mode: 'beast'}`; **renderiza badge "BEAST" na UI**. Mas `inject_context.js:798` lê `data.mode` (string key), que NÃO existe no schema `{beast_mode: true}` escrito por `mooter-autopilot.js`. Resultado: statusline mostra BEAST, classifier continua routing normal, user paga o que não esperava.
- **Expected**: um schema único partilhado por writer, reader, statusline.
- **Evidence**: estado actual de `~/.claude/tools/router/.mooter-mode.json` mostrado abaixo:
  ```json
  {
    "_description": "Feature flags for mooter/frugal router...",
    "beast_mode": true,
    "zen_mode": false,
    ...
  }
  ```
- **Blast radius**: 1 ficheiro escrito por `mooter-autopilot.js`, 1 ficheiro lido por `inject_context.js`, statusline renderer dual-reading. Reversível.
- **Fix proposal**: decidir schema canonical. Recomendado: `{mode: "beast" | "zen" | "auto", active_since, version}` (o schema do `mooter-mode.js`). Patchar `mooter-autopilot.js:49-55` para escrever esse schema em vez de `beast_mode`/`zen_mode` flags. Manter `beast_mode`/`zen_mode` campos extra por compat se necessário, mas `mode` field é authoritative.

#### [HIGH] F4.2 · Routing-audit `20.5%` honored é misleading

- **Location**: `savings-tracker.js:545-578`
- **Observation**: `computeRoutingAudit()` usa latency_proxy com tolerância 2x. `/metrics` reporta `estimated_honored_pct: 20.5` (430 audited, 88 honored). Isto sugere que o router ignora 79.5% das suas próprias recomendações. Na realidade o "overhead" vem dos tool-loop wall-clock (Claude faz dezenas de tool calls por turn), não de ignorar o router. O número está a medir *latência* e a atribuir a culpa à *obediência*.
- **Expected**: ou medir obediência com sinal directo (comparar recommended_model com execution.log actual model — o dado existe), ou remover este campo de `/metrics` até ter sinal melhor.
- **Evidence**: latency reportada `avg_ms: 129893` para tier baseline `opus_baseline_ms_est: 15777` → 8x overhead. Compatível com Claude fazer 8+ tool calls/turn, não com router desobediência.
- **Fix proposal**: substituir `computeRoutingAudit` por comparação directa session-level entre `decisions.log classified.recommended_model` e `execution.log model=` counts. Reportar como `compliance_pct` com methodology `exec_vs_recommended`.

#### [MEDIUM] F4.3 · `delta_vs_opus_ms: +114s` visual do "router slower than Opus"

- **Location**: `savings-tracker.js:115-189`
- **Observation**: `/metrics` reporta `delta_vs_opus_ms: 114116` → "router é 114s mais lento que Opus directo". Baseline assume 1 call Opus por turn; real tem N calls. Isto é honesto ao nível de código (methodology tag `measured_turn_wall_clock_vs_estimated_opus_baseline_2026q2`) mas visualmente assustador na statusline.
- **Fix proposal**: na statusline, mostrar `p50/p95 turn` sem comparar a baseline Opus, OU mudar baseline para `Opus × n_tool_calls_avg`. Documentar decisão.

#### [LOW] F4.4 · Per-call emoji: "claude-haiku-4-5" vs "claude-haiku-4-5-20251001"

- **Location**: `PostToolUse.js:45` e `exec-logger.js:58`
- **Observation**: `subagentTypeToModel('cheap-triage')` retorna `'claude-haiku-4-5'` (sem sufixo). Execution.log grava assim, mas real model ID Anthropic 2026 é `claude-haiku-4-5-20251001`. Emoji funciona (`includes('haiku')`), pricing funciona (tem ambas chaves). Pequeno mas anti-cert.
- **Fix proposal**: alinhar com HAIKU_MODEL_ID canonical (ver F2.3).

### Layer 5 — Mode Management

#### [CRITICAL] F5.1 · Schema-fork entre `mooter-mode.js` e `mooter-autopilot.js`

- **Location**: `frugal/tools/router/mooter-mode.js:76-79` vs `frugal/tools/router/mooter-autopilot.js:50-55`
- **Observation**: dois writers com schemas incompatíveis:
  - `mooter-mode.js` (skill-activated) → `{mode: "beast", active_since, version}`
  - `mooter-autopilot.js` (automated heuristic) → `{beast_mode: true, zen_mode: false, ...}`
  - Último a escrever vence; readers não conseguem normalizar. `inject_context.js` só reconhece o primeiro; `gsd-statusline.js` só reconhece o segundo (linhas 320-321).
- **Expected**: um único schema, escrito por qualquer writer, lido por qualquer reader.
- **Evidence**: ficheiro actual mostra formato autopilot; inject_context NÃO força T3; statusline mostra BEAST.
- **Fix proposal**: fazer `mooter-autopilot.js:49-55` escrever `{mode, active_since, version, beast_mode, zen_mode}` (união de schemas, preservando flags legacy como OR-read). Actualizar `inject_context.js:798` para reconhecer ambos: `const active = data.mode !== 'auto' ? data.mode : (data.beast_mode ? 'beast' : data.zen_mode ? 'zen' : null)`.

#### [MEDIUM] F5.2 · Gate bypass em zen é keyword-only

- **Location**: `inject_context.js:814`
- **Observation**: Gate detection: `/\b(push|merge|deploy|release|migration)\b/i`. Isto apanha "push the button" (false positive → bypass zen para coisa trivial). Mas a direcção do erro é conservadora (força T3 para safety) → aceitável.
- **Fix proposal**: nenhuma. Documentar que o false-positive rate é aceitável para o goal.

### Layer 6 — Savings Accounting

#### [CRITICAL] F6.1 · Arbiter metrics em `/metrics` são in-memory e zeram em cada restart

- **Location**: `savings-tracker.js:66-73, 580-592`
- **Observation**: `ARBITER_METRICS` é `let` module-scope, perde tudo quando o tracker reinicia. Decisions.log tem 80 eventos `arbiter_call`, mas `/metrics.arbiter.calls_total = 0` agora (tracker pid 51696 foi iniciado recentemente).
- **Expected**: persistir em disco (append-only ou snapshot), OU recomputar de decisions.log no startup.
- **Evidence**:
  ```
  $ grep -c '"event":"arbiter_call"' decisions.log → 80
  $ curl /metrics | jq .arbiter.calls_total → 0
  ```
- **Blast radius**: 1 ficheiro. Reversível.
- **Fix proposal**: em `savings-tracker.js`, no startup, ler últimas N linhas de decisions.log e seed `ARBITER_METRICS` com eventos `arbiter_call`. Ou: remover `ARBITER_METRICS` in-memory e computar sempre de decisions.log (custo: leitura extra de log, mas o tracker já lê para everything else).

#### [HIGH] F6.2 · Comment drift em `pricing.js.naiveOpusCost`

- **Location**: `pricing.js:174-183`
- **Observation**: Comment afirma "v0.10 fix: uses 1M-context pricing ($30/$150 per MTok) because Claude Code sessions always use the 1M context variant". Mas `priceTurn('claude-opus-4-6[1m]', ...)` retorna `{input: 5.0, output: 25.0}` (não $30/$150). A chave `claude-opus-4-6[fast]` é que tem $30/$150. Comment desfasado da reality.
- **Expected**: comment reflecte a chave usada e preço verificado.
- **Evidence**: pricing.js:34-36.
- **Impact**: apenas cosmético/confusão em auditoria — cálculo numérico correcto para Opus 4.6 1M standard pricing.
- **Fix proposal**: atualizar comment: "uses Opus 4.6 1M-context standard pricing ($5/$25 per MTok, 2026-Q1 verified); fast-mode ($30/$150) is a separate SKU and not the baseline".

#### [MEDIUM] F6.3 · Routing-inefficiency counter dead field

- **Location**: `savings-tracker.js:452`
- **Observation**: `m.routing_inefficiency_count` incrementado quando `saved<0` (T2 estimate exceeds T3 baseline — rare). Nunca exposto em `/metrics`, nunca consumido.
- **Fix proposal**: ou expor em `/metrics` como `routing_inefficiency_count` (útil para debug), ou remover.

#### [LOW] F6.4 · Tester log bloat

- **Location**: `decisions.log` — 26684 tester events vs 817 real classified (96% tester).
- **Observation**: log rotation absent. Decisions.log vai crescer indefinidamente.
- **Fix proposal**: log rotation a cada 100MB ou daily, com compressão `.gz`. Tester events podem ir para ficheiro separado (`decisions-tester.log`).

### Layer 7 — Docs / Memory / Notion

#### [MEDIUM] F7.1 · SYNC.md last-sync é 2026-04-18 (1 dia antigo)

- **Location**: `frugal/SYNC.md:6`
- **Observation**: "Última sync: 2026-04-18 late" — sessão #29 registada. Sessão #33 existe (fc2c991 commit trail menciona "session #33 addendum") mas não está no SYNC.
- **Fix proposal**: incluído no exit criteria — actualizar SYNC no fim desta auditoria.

#### [LOW] F7.2 · `feedback_dual_statusline_files.md` desactualizada

- Coberto em F1.2.

### Layer 8 — Landing Alignment

#### [MEDIUM] F8.1 · Landing está orfanada ou em migração

- **Location**: `frugal/landing/` contém só `README.md`; `frugal/mooter-design-updated/` está no status git como untracked (novo trabalho), mas glob não encontrou ficheiros `.html`.
- **Observation**: Sem conteúdo renderizado para comparar contra tracker real. Commit trail mostra "chore(cleanup): remove orphan mooter-landing/ static site" (`6ef03ac`) e "docs(sync): deploy confirmed - mooter.ai all endpoints 200". Landing vive em Vercel, não em repo.
- **Expected**: este audit layer requer inspecção do Vercel deployment, não do repo local.
- **Fix proposal**: remover Layer 8 deste audit scope (não é reproducível em repo) OU capturar screenshots/fetches da landing em runtime em auditoria separada. Nesta run: N/A.

---

## 4 · Cross-layer Integrity Matrix

| Invariante | Componente A | Componente B | Verdade? | Evidência |
|---|---|---|---|---|
| Active-mode reflecte runtime behavior | Statusline `.mooter-mode.json{beast_mode:true}` → "BEAST" | `inject_context.js` → não força T3 | ❌ **FALSO** | F4.1, F5.1 |
| Arbiter calls count consistente | `decisions.log` 80 arbiter_call events | `/metrics` 0 calls_total | ❌ **FALSO** | F6.1 |
| Edit em `frugal/` = runtime effect | `frugal/tools/router/classify.js` | `~/.claude/tools/router/classify.js` (runtime) | ❌ **FALSO** | F1.1 |
| `saved_pct` reproduzível | `/metrics` `saved_pct:74` | Cálculo `(68.52-17.81)/68.52 = 74.0%` | ✅ **VERDADE** | — |
| `plan` derivado correctamente | `.credentials.json.claudeAiOauth.subscriptionType` = max | `/metrics.plan` = "max" | ✅ **VERDADE** | savings-tracker.js:356 |
| Tester events excluídos das savings | decisions.log 26684 tester | `/metrics.prompts:794` (817 classified - 23 filtered) | ✅ **VERDADE** | — |
| Per-call emoji reflecte transcript | `PostToolUse.js` transcript-first order | exec-logger mesmo fallback order | ✅ **VERDADE** (casos normais) | F3.1 ameaça degradada |
| Haiku ID alinhado | `classify.js` `claude-haiku-4-5` | `arbiter.js` `claude-haiku-4-5-20251001` | ⚠️ **INCONSISTENTE** | F2.3 |
| Router-logic spec = implementação | `router-logic.md` "T0≤0.3 conf" | `classify.js` category-driven | ❌ **SPEC DRIFT** | F2.1 |
| Option-A deflection contabilizada | 104 option_a_hits em decisions.log | `/metrics.option_a_hits:104, guaranteed_saved:8.97` | ✅ **VERDADE** | — |

**10 invariantes verificadas — 4 verdadeiras, 2 incoerentes, 4 falsas.**

---

## 5 · Remediation Plan

Ordenado por severidade. Nenhum fix é aplicado sem aprovação.

| # | Severity | Finding | Fix | ETA | Depends on | Files touched | Reversible |
|---|---|---|---|---|---|---|---|
| 1 | CRITICAL | F5.1 + F4.1 (mode schema fork) | Patch `mooter-autopilot.js` para escrever `{mode, active_since, version, beast_mode, zen_mode}` union schema; patch `inject_context.js:798` para ler ambos | 20 min | — | 2 files | ✅ |
| 2 | CRITICAL | F6.1 (arbiter metrics volatile) | No startup de `savings-tracker.js`, tail decisions.log últimas 10k linhas e seed `ARBITER_METRICS` com eventos `arbiter_call` + `arbiter_event` | 25 min | — | 1 file (`savings-tracker.js`) | ✅ |
| 3 | CRITICAL | F1.1 (triple-location drift) | Decidir canonical location. Criar `frugal/tools/router/sync-router.sh` que faz `cp -r` para `~/.claude/tools/router/` post-commit (hook local). Documentar em INFRA.md. Remover cópias não-wired em `~/.claude/hooks/` que são stale. | 45 min | — | 1 script + INFRA.md update + remove 2-3 stale files | ✅ |
| 4 | HIGH | F2.1 (spec/impl drift) | Reescrever "Tier thresholds (fixed)" em `router-logic.md` para descrever category-driven selection com confidence como sinal derivado | 10 min | — | 1 file | ✅ |
| 5 | HIGH | F3.1 (exec-logger degraded mode lies) | Prefixar `model_actual=` vs `model_advisory=` conforme `mode=` na mesma linha | 15 min | 3 (sync) | 1 file | ✅ |
| 6 | HIGH | F4.2 (routing-audit misleading) | Substituir `computeRoutingAudit` por comparação directa `decisions.log.recommended_model` vs `execution.log.model=` em janela session-scoped; renomear métrica para `compliance_pct` | 30 min | 2 | 1 file | ✅ |
| 7 | HIGH | F6.2 (pricing.js comment drift) | Corrigir comment | 2 min | — | 1 file | ✅ |
| 8 | MEDIUM | F2.2 (gemma4:e4b risky default) | Fallback para `qwen2.5:3b`; deferir best-general para hook via env var | 10 min | — | 1 file | ✅ |
| 9 | MEDIUM | F2.3 (Haiku ID inconsistent) | Exportar `HAIKU_MODEL_ID` shared constant | 15 min | — | 3 files | ✅ |
| 10 | MEDIUM | F3.2 (exec-logger/PostToolUse duplication) | Extrair `_model-resolver.js` shared helper | 25 min | 5 | 3 files | ✅ |
| 11 | MEDIUM | F4.3 (delta_vs_opus visual) | Remover comparação ou usar tool-loop-aware baseline | 15 min | — | 1-2 files | ✅ |
| 12 | MEDIUM | F6.3 (dead counter) | Expor ou remover `routing_inefficiency_count` | 5 min | — | 1 file | ✅ |
| 13 | MEDIUM | F6.4 (log bloat) | Daily rotation script para decisions.log + separar tester | 30 min | — | 1 new script + cron | ✅ |
| 14 | MEDIUM | F7.1 (SYNC.md stale) | Actualizar com sessão #34 = este audit | 5 min | — | 1 file | ✅ |
| 15 | MEDIUM | F8.1 (landing scope) | Descopar Layer 8 deste audit; criar audit separado contra deployment | 0 min | — | 0 | — |
| 16 | LOW | F2.4 (arbiter latency_ms unset) | Um-liner em arbiter.js:309 | 2 min | — | 1 file | ✅ |
| 17 | LOW | F3.3 (last-subagent stomp risk) | Documentar | 3 min | — | 1 doc | ✅ |
| 18 | LOW | F4.4 (emoji Haiku ID) | Auto-fix via F9 | 0 min (incluído) | 9 | 0 | — |

**Total ETA**: ~4 horas para resolver 17 findings accionáveis (F8.1 descopado). Sprint recomendado:

- **Sprint A (1h)** — Fixes 1, 2, 7, 8, 12, 14, 16 (CRITICAL e quick-wins). Resolve as 3 mentiras principais + comment + dead fields.
- **Sprint B (1.5h)** — Fixes 3, 4, 5, 9, 10. DRY + canonical location + spec alignment.
- **Sprint C (1h)** — Fixes 6, 11, 13. Métricas mais honestas + log hygiene.
- **Sprint D (30min)** — Fixes 15, 17. Descope + docs.

---

## 6 · Notion + SYNC

Página a criar sob HQ Notion (`33d6f6e4-2bc4-816b-977a-fe84bbe912c9`):
- Título: `🔍 Auditoria Mooter 2026-04-19 — 3 CRITICAL, 6 HIGH, 5 MEDIUM, 3 LOW`
- Conteúdo: copy do presente AUDIT-MOOTER.md.
- Link adicionado ao SYNC.md na secção "📥 COWORK → CLAUDE CODE" com próximas acções = Sprint A aprovação.

---

## 7 · Rollback Readiness

- **Commit atual**: `fc2c991360c4acffe2a4322d2d1b8aed82ac620b`
- **Ficheiros modificados (working tree, PRE-audit)**: `tools/router/gsd-statusline.js`, `tools/router/mooter-continuous-tester.js`, `tools/router/mooter-review.js` (M). Untracked: `mooter-design-updated/`, `docs/AUDIT-MASTERPROMPT.md` (criado nesta run), `AUDIT-MOOTER-2026-04-19.md` (criado nesta run).
- **Nenhum fix aplicado.** Repo read-only desde entrada do audit.
- **Reprodução dos findings**:
  - F4.1/F5.1: `cat ~/.claude/tools/router/.mooter-mode.json` (mostra `beast_mode:true`, sem `mode`) + `curl /metrics` (mostra T0 rate 70.5% — routing normal, não beast).
  - F6.1: `grep -c '"event":"arbiter_call"' ~/.claude/tools/router/decisions.log` (80) vs `curl /metrics | jq .arbiter.calls_total` (0).
  - F1.1: `diff -q ~/.claude/tools/router/classify.js frugal/tools/router/classify.js` (reporta "differ").

---

## 8 · Exit Criteria Status

1. ✅ Secções 1-5 com evidência por finding
2. ✅ Cross-layer matrix sem células vazias (10 invariantes cobertas)
3. ⏳ Página Notion criada — pendente execução
4. ⏳ SYNC.md actualizado — pendente execução
5. ⏳ Paulo aprovou remediation plan — **BLOCKED até revisão**

Assinatura: model-architect (Opus 4.7 1M), 2026-04-19, sessão `6e8cbf83`.
