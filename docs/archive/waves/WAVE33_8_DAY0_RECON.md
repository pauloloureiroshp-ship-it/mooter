# Wave 33.8 — Day 0 Honest Recon (Statusline 2.0)

> Composto 2026-06-08, modo ultracode + dangerous autonomous. Branch `wave33_8-statusline-v2` (base `9dd9916`, Wave 33.7 ship). Source: leitura directa do código + estado real de `~/.mooter/`. **Honest > forced.**

## TL;DR — 4 catches que mudam o brief

1. **`packages/` está congelado (18 waves + acceptance gate), `tools/router/` NÃO.** Block C ("workflow runner adquire Conductor lock") implicaria editar `@mooter/workflow` (frozen). Resolução honesta: a integração entrega-se **ao nível do statusline/router** (chip combinado a ler ambas as fontes), não editando o pacote congelado. O "runner acquires lock" fica documentado como futura un-freeze.
2. **`~/.mooter/auth.json` só tem `user_id_hash` opaco (`f50b36ca…`), zero GitHub handle.** Block E não pode mostrar `🐙 @handle` (seria fabricado). Honest: `👤 user f50b36ca` (prefixo do hash) quando logged in, silent quando logged out.
3. **`recommended_model` logado = `claude-opus-4-6` (default T3 do `TIER_TO_PRICING_KEY`), NÃO o opus-4-8 da sessão.** Block F mostra o modelo *roteado/recomendado* honestamente; "opus-4.7/4.8" no brief era ilustrativo. `pricing.js` só tem keys até `opus-4-6`.
4. **A duplicação RTX 4090 EXISTE — mas via `🔧`, não `🐍`.** Line 2 `🎮 RTX 4090 …VRAM` + Line 3 `🔧 nvidia-rtx-4090` (de `setup-status.js`, que imprimia `hardware_class`). O audit §1 escreveu `🐍` por engano; o glyph real é `🔧`. Block D corrigido: `setup-status.js` passa a preferir `hw_tier` (`gpu-high` — uma *classe* real) sobre o model id, deduplicando contra a Line 2 sem perder info. Enriquecer com driver/CUDA não é viável (não está em `setup_profile.json`; `nvidia-smi` violaria ≤10ms).

## 10 pontos

### 1. classify.js sha — INTACT
`7b01eb8623a0b8fcff17b976e9afcf572f3a762bf60c578a5099dac014b87762` (full). Bate com `EXPECTED_CLASSIFY_SHA` em `packages/synthesis/src/state/central-state.ts:16`. 18 waves consecutivas.

### 2. Wave 28-33.7 packages — todos presentes
`workflow synthesis validation mcp-server transparency effort data-rights vllm-backend sessions-orchestrator worktree-conductor spawn-orchestrator turboquant-backend minimax-watcher arbitrage-monitor` — 14/14 OK. **A não tocar** (gate `git diff --stat`).

### 3. statusline-multi.js arquitectura
- Entry `render(ctx)` (`:1088`) → modes (`statusline-modes.js`) ou width-based: `renderTwoLine` (≥120 cols) vs `renderFromContext` (1-line).
- Line 1 headline + tier label (`:329-372`, `lastLabel` = `T3 opus · conf 0.90`).
- Line 2 array (`:1023-1038`): home·gpu·ctx·quota·sessionTimer·thisPrompt·session·tokens·herds·quant·pack·adapter.
- Line 3 `buildLine3(force)` (`:1052-1081`): opt-in (`preferences.json statusline_line3` ou `MOOTER_STATUSLINE_LINE3=1`), itera 19 módulos `*-status.js`, cada `.statusLine()` → null se inactivo. Todo throw é engolido.
- Budget ≤10ms: tail-read de decisions.log (256KB), zero subprocess no hot path.

### 4. Chips Line 3 (registry `:1065-1074`)
compression · setup · ecosystem · wave · dogfood · mlwr · limits · pastor · effort · quant · vector · turboquant · eagle3 · minimax · arbitrage · **terminal-name** · **workflow-progress** · spawns · **conductor**. Cada lê um snapshot JSON específico em `~/.mooter/`.

### 5. Savings / alltime stats
- Fonte: `~/.claude/tools/router/decisions.log` (JSONL, 1 linha/evento via `inject_context.js`). Campos confirmados (último evento): `tier, recommended_model, confidence, task_category, session_id, …`.
- `savedUsd`/`savedPct` headline = cumulativo sobre **todo** o decisions.log (sem date filter) → o label "all-time" está **correcto** para a Line 1 local.
- Per-session: filtrado por `session_id` (`digest()` `:203`).
- **A discrepância $0.00 local vs $25.95 landing** NÃO é bug: decisions.log é **per-máquina local**; o hub D1 (`/v1/user/dashboard`) é o agregado **cross-device** keyed por `user_id_hash`. São fontes diferentes. Block A = sanity check que torna isto explícito.

### 6. Hub `/v1/user/dashboard` (Wave 33.7)
`hub/routes/user-dashboard.js:24-106`. `GET ?user_hash=<16hex>` → `{ scope, source:'empty|live', total_calls, saved_usd, saved_avg_per_call_usd, tier_distribution{T0..T3}, top_categories[], devices_active, last_active_at, last_updated }`. `saved_usd = SUM(per_decision_savings_usd)` all-time. Invalid hash → 422 (fix `f1cae8d`).

### 7. Conductor heartbeat (Wave 33.5)
- Path `~/.mooter/orchestration/heartbeats/<safe-session-id>.json` (`heartbeat.ts:32`).
- Schema: `{ session_id, terminal_name, worktree_path, branch, intent, last_heartbeat, last_heartbeat_ms, active_locks[], pending_intents[], pid }`.
- Locks `~/.mooter/orchestration/locks/*.lock` (`{ resource, acquired_by, terminal_name, intent, acquired_at_ms, ttl_seconds, pid }`), TTL default 60s, stale excluído.
- Estado actual: dir `heartbeats/` existe mas vazio (nenhuma sessão activa via Conductor agora). `conductor-status.js` já lê locks live.

### 8. Workflow Engine state (Wave 28)
- Source of truth: `~/.mooter/workflows/state.db` (better-sqlite3). Tabelas `runs/checkpoints/agents`.
- Live breadcrumb: `~/.mooter/workflows/active-run.json` (`active.ts`), shape `ActiveRunSnapshot { run_id, workflow_name, status, phase, num_phases, agents_done, agents_total, ts }`. Lido por `workflow-progress-status.js` (READ-ONLY).
- **Não chama Conductor.** Sandbox isolated-vm sem fs/child_process → guardrails são writer-layer. `locks_held` NÃO existe no snapshot hoje.

### 9. Supabase session / auth local
- `~/.mooter/auth.json` (mode 0600) via `mooter login`: `{ access_token, user_id_hash, saved_at, source }`. **Único cache de identidade.** Sem GitHub handle, sem email (privacy: hash opaco SHA256[:16]).
- `mooter logout` remove o ficheiro. `mooter login --status` mostra `user <hash[:8]>…`.

### 10. Pricing + tier→model string
- `tools/router/pricing.js`: `PRICES{}` (`:46` opus-4-6 in 5.0/out 25.0; haiku-4-5 1.0/5.0; sonnet-4-6 3.0/15.0; locais $0). `TIER_TO_PRICING_KEY{T0:qwen2.5:3b,T1:haiku-4-5,T2:sonnet-4-6,T3:opus-4-6}` (`:109`). **Sem keys opus-4-7/4-8.**
- Line 1 tier label: `TIER_DEFAULT_TAG{T0:local,T1:haiku,T2:sonnet,T3:opus}` + `suggested_providers[0]` (`:332-350`).
- Block F mostra `recommended_model` curto (ex. `opus-4.6`) — o que está realmente logado/roteado.

## Plano de execução (honest scope por block)

| Block | Scope honesto | Toca packages/? |
|---|---|---|
| A | `mooter doctor` check #6 (stats local vs hub cached snapshot, drift >5% → warn + `mooter sync --rebuild-stats`) | doctor.ts é CLI app, não pacote frozen — OK editar |
| B | novo `sessions-count-status.js` lê heartbeats; terminal-name enriquece `(N active)` só quando ≥2 (single-session byte-identical) | não |
| C | `workflow-progress-status.js` junta progress + conductor locks da sessão actual; `locks_held` opcional no snapshot lido. Runner-lock + TUI = documentado/deferred | não (router-level) |
| D | `setup-status.js` prefere `hw_tier` (gpu-high) sobre model id → dedup real vs Line 2 | não |
| E | novo `user-status.js` lê auth.json → `👤 user <hash8>` / silent logged-out; `--hide-user` | não |
| F | Line 1 `T3 opus-4.6` (modelo do `recommended_model`); Line 2 token chip enriquecido | não |
| G | `mlwr-status.js` empty → `📚 MLWR · run benchmark` | não |
| H | labels: confirmar "all-time" (correcto) + "session" explícito; alinha com A | não |

**Conclusão:** zero edits a `packages/` Wave 28-33.7, zero a `landing/` e `landing-v12-deploy/`, classify.js intacto. Todo o trabalho vive em `tools/router/` + `packages/cli/src/commands/doctor.ts` (+ sync) que são camada de aplicação, não os engines congelados.
