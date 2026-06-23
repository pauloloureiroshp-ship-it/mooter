# Statusline Audit + v2.0 Proposal — Wave 33.8 Brief Draft

> Composto 2026-06-08 pós Paulo's 11 questions sobre statusline + final-reviewer Wave 33.7 in progress. Decompõe statusline linha-a-linha, responde questões honest, propõe gaps reais + Wave 33.8 brief para statusline 2.0 (multi-terminal + sub-tiers + GitHub user + Conductor/Workflow integration + dedupe).

---

## §1 Statusline actual (decomposição line-by-line)

```
Line 1: 🐮 saved $0.00 all-time (0% vs all-Opus) · █ last 10 · T3 opus · conf 0.75
Line 2: 0/269 calls (0%) · 0% tokens local · 🎮 RTX 4090 18% VRAM (4.4/24 GB) · ☁ Claude Max 100% · 5h reset · ⏱️ session 26m · this prompt $0.09 · session $0.09 · 🪙 T0:0 tkns · T1:0 · T2:0 · T3:263.8k · 🐂 0/0/peak0 · 🐎 baseline · trained on 303 decisions
Line 3: 🐍 nvidia-rtx-4090 · ☁ claude-max · 📚 MLWR 100% local · 🔒 limits OK · 🦊 qwen3:30b · Q4_K_M · 18.6 GB · 🌐 nomic-embed-text · 768d · 🪟 paulo-1338
```

### Line 1 — Macro headline (cumulative session)

| Chip | Significa | Healthy = | Danger = |
|---|---|---|---|
| `🐮 saved $X all-time (Y%)` | $ poupado vs all-Opus baseline desde sempre | ↗ growing | $0 by mistake (bug) |
| `█ last 10` | Mini-sparkline tier distribution últimos 10 prompts | Mix T0/T1/T2/T3 | All T3 (over-spending) |
| `T3 opus` | Tier + model recommended para PRÓXIMO prompt | match a complexity | T3 em prompts triviais |
| `conf 0.75` | Confidence (0-1) da decisão classify.js | > 0.7 | < 0.5 (drift) |

### Line 2 — Operational state (current state)

| Chip | Significa | Healthy = | Danger = |
|---|---|---|---|
| `0/269 calls (0%)` | calls esta sessão / alltime · % local | growing alltime | 0% nunca (algum local) |
| `0% tokens local` | % tokens processados localmente | >40% | <10% (over-cloud) |
| `🎮 RTX 4090 18% VRAM (4.4/24 GB)` | GPU model + VRAM used/total | <60% | >95% (OOM risk) |
| `☁ Claude Max 100%` | Anthropic 5h quota remaining | >30% | <10% (lock soon) |
| `5h reset` | Quota window type (5h vs daily) | — | — |
| `⏱️ session 26m` | Tempo desde início desta sessão CC | — | — |
| `this prompt $0.09` | Custo do prompt actual | match complexity | $$ em triviais |
| `session $0.09` | Custo cumulativo esta sessão | growing slowly | spike rápido |
| `🪙 T0:0 · T1:0 · T2:0 · T3:263.8k` | Tokens por tier esta sessão | mix | só T3 (bad) |
| `🐂 0/0/peak0` | Subagents: active/total/peak | — | high peak = parallelism |
| `🐎 baseline` | LoRA adapter active | baseline OR trained | broken adapter |
| `trained on 303 decisions` | Total routing decisions logged | growing | flat (no learning) |

### Line 3 — Opt-in detail chips (mode full)

| Chip | Significa | Healthy = | Danger = |
|---|---|---|---|
| `🐍 nvidia-rtx-4090` | GPU detector status | matches reality | mismatch (driver issue) |
| `☁ claude-max` | Subscription type | claude-max OR free | expired |
| `📚 MLWR 100% local` | **M**ooter **L**ocality **W**in **R**ate — % dos prompts compatíveis com local que foram para local | >90% | <60% (over-cloud) |
| `🔒 limits OK` | Rate limits status (API quotas) | OK | WARN/FAIL |
| `🦊 qwen3:30b · Q4_K_M · 18.6 GB` | Active Ollama model · quantization · size | matches policy | wrong model |
| `🌐 nomic-embed-text · 768d` | Embedding model · vector dimensions | nomic + 768 | other less common |
| `🪟 paulo-1338` | Terminal label (env var MOOTER_TERMINAL_NAME OR fallback) | meaningful name | unknown |

---

## §2 Respostas às 11 perguntas do Paulo

### Q1 — O que é MLWR?

**Mooter Locality Win Rate** (inventado pelo Mooter Wave 30 Phase N).

**Definição precisa** (source: `tools/router/mlwr-status.js`):
- Reads cached MLWR snapshot from `~/.mooter/mlwr_snapshot.json`
- Written by `mooter benchmark run`
- Shows overall local win-rate as percentage
- Wave 30 invenção para tracking **routing efficiency**

**Interpretação:**
- MLWR 100% local = **dos prompts elegíveis para local**, 100% foram para local (perfeito)
- MLWR 60% local = 40% foram para cloud quando podiam ter ido local (desperdício)
- MLWR <50% = router está a falhar (over-cloud)

**É chip didactic** — só relevante após `mooter benchmark run` (snapshot existir).

### Q2 — O que é nomic-embed-text?

**Modelo de embedding (text → vector)** usado pelo Mooter para semantic similarity.

- **Nomic Embed Text v1.5** (open source, MIT)
- 137M params, 768 dimensions output
- Roda local via Ollama
- Usado para classificar similarity entre prompts (Pastor learning, LORAUTER)
- Alternative seria OpenAI ada-002 (cloud, paid)

### Q3 — 768d são dias?

**NÃO.** São **dimensions** do vector embedding.

Cada texto é convertido em vector de 768 números (floats). 768 = dimensionalidade do vector space.

**Comparação:**
- OpenAI ada-002: 1536d
- BGE-large: 1024d
- **nomic-embed-text: 768d** ← Mooter usa
- all-MiniLM-L6-v2: 384d (mais pequeno)

**Tradeoff:** maior dimensão = melhor representation mas mais memory + slower.

**Não é tempo de sessão.** Para tempo da sessão tens `⏱️ session 26m` em Line 2.

### Q4 — (saltou na numeração Paulo, mas vou cobrir)

`📊 MLWR 100% local` — bom sinal. Significa que durante o benchmark mais recente, **TODOS os prompts compatíveis com modelo local foram efetivamente para local**. Zero waste.

### Q5 — paulo-1338 é o que? Não deveria ter lista de terminais abertos simultâneos?

**Resposta:** `paulo-1338` é **o terminal label DESTE shell apenas** (current terminal), não todos.

**Fonte:** Wave 33.6 Block P5 fix. Resolution chain:
1. `$MOOTER_TERMINAL_NAME` (env var, priority #1) ← provavelmente set para "paulo-1338" no shell init
2. preferences.json terminal_label
3. $TMUX_PANE_TITLE / $ZELLIJ_SESSION_NAME / $WEZTERM_PANE
4. git branch
5. cwd basename

**Gap REAL que apontaste:** chip statusline **não mostra cross-terminal visibility**. Só sabe deste terminal.

**Workaround actual:** Wave 33.5 Sessions Orchestrator tem `mooter sessions list` CLI cmd que mostra todos os terminais activos com tier breakdown + savings. Mas é cmd, não chip.

**Proposal (Wave 33.8):** Adicionar chip `🪟 paulo-1338 (3 active)` que mostra current + count de outros sessions live (via Conductor heartbeat).

### Q6 — Worktree + Dynamic Workflow do Moo local não deveriam se falar?

**TENS RAZÃO.** Há gap real.

**Estado actual:**
- **Conductor (Wave 33.5 Block H)** = sabe das locks (`~/.mooter/orchestration/locks/`) + heartbeats
- **Workflow Engine (Wave 28)** = sabe dos workflow runs (`~/.mooter/workflows/<id>/state.json`)
- **NÃO COMUNICAM** entre si actualmente

**Gap:** se Workflow A em terminal 1 quer fazer `git push`, deveria adquirir lock via Conductor. Mas hoje o workflow_runner.js não chama Conductor.

**Proposal (Wave 33.8):**
1. Workflow runner adquire Conductor lock antes de tool calls perigosos (git/Notion/deploy)
2. Workflow state inclui `lock_held: [git-frugal-hash, notion]`
3. Chip statusline novo: `🔄 wf-abc 3/7 💠💠💠○○○○ 🔒 git+notion · 4.2k tk` — mostra workflow PROGRESS + LOCKS held em uma linha
4. Sessions watch TUI mostra cross-session: que terminal tem que lock, que workflow está em qual terminal

### Q7 — Todos os números batem em tempo real inclusive com a landing page?

**Discrepância real detectada.** Olha:

**Statusline mostra:**
- saved `$0.00 all-time (0% vs all-Opus)` ← **PROBLEMA: diz "all-time" mas é $0.00**
- `0/269 calls (0%)` ← 0 calls esta sessão / 269 alltime
- `trained on 303 decisions` ← growing (era 293 antes)

**Landing page (mooter.ai prod) mostra:**
- $25.95 saved alltime
- 658 calls
- 47% saved
- 3 packs

**Análise:**
- `269 calls` em statusline ≠ `658 calls` em landing → STATUSLINE PODE estar a contar diferente (talvez só waves recentes)
- `$0.00 all-time (0%)` ← **bug provável** OR contexto fresh (nova install não-sync)
- `303 decisions` vs `293 antes` ← Pastor learning growing, OK
- `total Paulo data = $25.95 / 658 calls / 47%` ← landing é fonte de verdade alltime

**Probable causes:**
1. **Sessão fresh** — esta sessão CC ainda não syncou com alltime stats
2. **Multi-source desalinhamento** — statusline lê `~/.mooter/savings_calc.json` vs landing lê `mooter-hub` D1 events table — podem ter divergido
3. **MOOTER_HOME diferente** entre terminals (se MOOTER_HOME=algo override no shell)

**Recommendation:** Wave 33.8 Block adicionar sanity check `mooter doctor` que detecta discrepância entre statusline alltime e hub alltime + alerta.

### Q8 — Limits OK é o que?

**Estado dos rate limits + budget caps.**

Verifica:
1. Anthropic 5h quota (não excedeu)
2. Daily/monthly budget cap (`mooter cost-cap`)
3. Provider-specific rate limits (Anthropic API, OpenAI, etc.)
4. Hub event ingestion rate (D1 throttle)

**Possíveis estados:**
- `🔒 limits OK` ← tudo verde
- `🔒 limits WARN` ← próximo de algum limit
- `🔒 limits FAIL` ← algum limit hit

**Source code chip:** `tools/router/limits-status.js`.

### Q9 — Não tem redundância mostrando RTX 4090?

**SIM, há redundância.** Olha:
- **Line 2:** `🎮 RTX 4090 18% VRAM (4.4/24 GB)` — model + VRAM usage
- **Line 3:** `🐍 nvidia-rtx-4090` — model only

**Linha 3 chip não acrescenta info** que Line 2 não tem. Apenas glyph diferente (🐍 vs 🎮).

**Possibilidades:**
1. **Remover Line 3 GPU chip** — limpa, sem perda
2. **Merge:** se Line 2 está visível, skip Line 3 GPU chip
3. **Variar info:** Line 2 = "VRAM agora", Line 3 = "GPU model + driver version + CUDA"

**Recommendation:** Wave 33.8 dedupe — remover `🐍 nvidia-rtx-4090` de Line 3 (redundant) ou enriquecer com driver/CUDA info.

### Q10 — Não deveria mostrar qual user (GitHub) está usando?

**Excelente ideia. Hoje NÃO mostra.**

**Estado actual:**
- Terminal name = `paulo-1338` (cosmético, não user)
- Sem chip de user GitHub identity

**Wave 33.7 vai trazer:** GitHub OAuth via Supabase (em curso CC final-reviewer agora!)

**Quando Wave 33.7 ship, chip futuro:**
- `🐙 @pauloloureiroshp-ship-it` — GitHub handle
- OR `👤 paulo.loureiro.shp@gmail.com` — email
- OR `🏠 anon` — quando logged out (privacy preserving)

**Recommendation:** Wave 33.8 Block adicionar `user-status.js` chip:
- Reads Supabase session from cookie cache OR env var
- Returns `🐙 @handle` se logged in, silent se logged out (privacy default)
- Hide via `mooter quiet --hide-user`

### Q11 — T0/T1/T2/T3 são poucos tiers? Custo/perf varia mais

**TENS RAZÃO. Os 4 tiers actuais escondem variability real.**

**Realidade dos tiers:**

| Tier | Modelos actuais (Mooter) | Custo input/M | Custo output/M | Latency |
|---|---|---|---|---|
| T0 | qwen3:30b, qwen2.5-coder:14b, qwen2.5:3b, gemma3:12b, deepseek-r1:7b (Ollama local) | $0 | $0 | 80-300ms |
| T1 | Haiku-4.5, Haiku-4-5-20251001 | $0.25-0.80 | $1.25-4.00 | 200-400ms |
| T2 | Sonnet-4.6, (Sonnet-4.5?) | $3-15 | $15-75 | 1-3s |
| T3 | **Opus-4.6, Opus-4.7, Opus-4.8** | $15-50 | $75-250 | 3-10s |

**Problemas com 4-tier:**
- Opus 4.6 vs 4.7 vs 4.8 têm preços diferentes — não há distinção
- Haiku 4.5 vs 4-5-20251001 (snapshot version) — não há distinção
- Local qwen3:30b (18GB) é MUITO mais smart que qwen2.5:3b (2GB) — não há distinção
- Cost var em T3 é 3x (Opus 4.6 vs Opus 4.8) — escondido

**Proposta Paulo (T0.1, T0.2, T1.1, etc.) — análise:**

**Pros:**
- Granularidade real de custo
- Routing fine-grained possível
- Transparency aumenta

**Cons:**
- Mais chips na statusline (overhead visual)
- classify.js mais complexa
- Mais decisão para Pastor learning

**Alternative formats:**

### Opção A — Sub-tiers explicit (Paulo's proposal)
```
T0.1 qwen3:30b   $0      ~250ms
T0.2 qwen2.5-coder:14b $0  ~180ms
T0.3 qwen2.5:3b  $0      ~80ms
T1.1 haiku-4.5   $0.25/M  ~250ms
T2.1 sonnet-4.6  $3/M     ~1.5s
T3.1 opus-4.6    $15/M    ~3s
T3.2 opus-4.7    $20/M    ~3.5s
T3.3 opus-4.8    $25/M    ~4s
```

Statusline: `T3.2 opus-4.7 · $0.04/turn` ← mostra exact model + cost actual

### Opção B — Single "tier" mas mostrar model + cost explicit (alternativa)
```
Statusline: `T3 opus-4.8 $0.04/turn` (model name no chip, não só "opus")
```

Mantém 4-tier mas chip diz qual Opus exact.

### Opção C — Cost band (não tier) — mais radical
```
$0 (local) → $1¢-10¢ (cloud light) → $10¢-50¢ (cloud med) → $50¢+ (cloud heavy)
```

Removes tier abstraction completamente. Just $$$ band.

**Minha recomendação:** **Opção B** (model+cost no chip mantendo 4-tier) — balance entre clarity + transparency sem explodir cardinality.

Mas se quiseres ir all-in com Opção A, vamos lá. **Wave 33.9 candidate**.

---

## §3 Resumo: como ler "Mooter está indo bem ou não?"

### ✅ VERDE (tudo OK)

```
saved $X.XX positive · MLWR >85% local · limits OK · VRAM <60% · session running >5 min · last 10 mix tiers · conf >0.7
```

**Sinais:** routing healthy, learning ongoing, savings accumulating, no overspend.

### 🟡 AMARELO (atenção)

```
saved $0 em sessão >30 min · MLWR <60% local · VRAM 60-90% · Claude Max <30% · last 10 all-T3 em prompts triviais
```

**Sinais:** ou over-cloud (router pode estar com drift) ou approaching quota wall.

**Action:** check `mooter doctor`, considera `/effort eco` para forçar T0/T1.

### 🔴 VERMELHO (problema)

```
saved negative · MLWR <40% · limits FAIL · VRAM >95% (OOM risk) · Claude Max <10% · conf <0.5 (drift)
```

**Sinais:** drift severo, quota crash iminente, hardware issues.

**Action:** `mooter doctor --fix`, possibly `/exit` and `mooter conductor unlock all`.

---

## §4 Gaps identificados (input para Wave 33.8 brief)

| # | Gap | Severidade | Wave 33.8 Block |
|---|---|---|---|
| 1 | Statusline alltime mostra $0.00 mas landing mostra $25.95 (desalinhamento) | HIGH | A — sync sanity check |
| 2 | Sem cross-terminal visibility chip (só current) | MED | B — sessions count chip |
| 3 | Worktree Conductor + Workflow Engine não comunicam | HIGH | C — integration |
| 4 | RTX 4090 duplicado em Line 2 e Line 3 | LOW | D — dedupe |
| 5 | Sem chip de user GitHub identity | MED | E — user chip (post Wave 33.7) |
| 6 | T0/T1/T2/T3 escondem variability real (Opus 4.6 vs 4.7 vs 4.8) | MED | F — sub-tiers OR model+cost explicit |
| 7 | `269 calls` em statusline ≠ `658` em landing | HIGH | A — sync sanity check |
| 8 | `📚 MLWR 100% local` só é meaningful se `mooter benchmark` foi corrido | LOW | G — empty state better message |
| 9 | Sem chip de active workflows count (mesmo gap como sessions) | MED | C — workflow integration |
| 10 | Numbers no statusline são "current session" mas labelled "all-time" misleading | HIGH | A + H — labels correctos |

---

## §5 Wave 33.8 brief draft (statusline 2.0)

**Tag esperada:** `v1.21.4-statusline-2.0`
**Estimate:** ~3-4h CC autonomous
**Prioridade:** depois de Wave 33.7 (landing-enhance) ship

### Blocks ordenados

#### Block A — Sync sanity check (~30 min, T2)
- `mooter doctor` adiciona check: statusline alltime stats vs hub D1 events alltime
- Alertar quando >5% drift
- Fix cmd: `mooter sync --rebuild-stats`

#### Block B — Sessions count chip (~45 min, T2)
- Chip novo: `🪟 paulo-1338 (3 active)` mostra terminal current + count de outros active
- Reads `~/.mooter/orchestration/heartbeats/*.json` (Wave 33.5 Conductor)
- Cross-session aware sem precisar TUI

#### Block C — Conductor + Workflow integration (~1.5h, T3 Opus)
- Workflow runner acquires Conductor lock antes de tool calls perigosos (git/Notion/deploy)
- Workflow state inclui `locks_held`
- Chip statusline novo: `🔄 wf-abc 3/7 💠💠💠○○○○ 🔒 git+notion · 4.2k tk` — combina progress + locks em uma linha
- Sessions watch TUI mostra cross-session com workflow IDs

#### Block D — Dedupe RTX 4090 (~15 min, T1)
- Remove `🐍 nvidia-rtx-4090` de Line 3 (redundant com `🎮 RTX 4090 18% VRAM`)
- OR enriquece com driver version + CUDA: `🐍 NVIDIA 560.35 · CUDA 12.4`

#### Block E — User chip (post Wave 33.7) (~30 min, T1)
- Cria `tools/router/user-status.js`
- Reads Supabase session cookie / env var
- Chip: `🐙 @handle` quando logged in, silent quando logged out (privacy default)
- Hide via `mooter quiet --hide-user`

#### Block F — Sub-tiers OR explicit model+cost (~1h, T2)
- **DECISÃO Paulo:** Opção A (sub-tiers T0.1/T1.1/etc) OR Opção B (model+cost no chip) OR Opção C (cost bands)
- Implementar escolhida
- Statusline chip: `T3 opus-4.7 $0.04/turn` (Opção B) ou `T3.2 opus-4.7 $0.04/turn` (Opção A)

#### Block G — MLWR empty state better message (~10 min, T1)
- Quando snapshot ausente, chip mostra: `📚 MLWR · run benchmark`
- Em vez de chip silent

#### Block H — Labels correctos all-time vs session (~20 min, T1)
- "all-time" só quando truly all-time
- "this session" quando current
- Compatible com Block A sync sanity check

### Acceptance gates
- [ ] classify.js sha INTACT
- [ ] Wave 28-33.7 packages INTOCADOS
- [ ] Statusline budget ≤10ms preserved
- [ ] No statusline regressions (existing chips work)
- [ ] sync sanity check detects discrepancy
- [ ] Cross-terminal count visible em chip
- [ ] Workflow + Conductor integration tested
- [ ] User chip respect privacy defaults
- [ ] Model+cost explicit (chosen option)

---

## §6 Como propor sub-tiers (Opção A) honestly

Se decidires ir Opção A com sub-tiers granular:

### Cost/perf matrix completo (research needed)

```
TIER 0 (LOCAL):
  T0.1 qwen2.5:3b           2GB  ~80ms  ★ classificação simple
  T0.2 qwen2.5-coder:14b    14GB ~150ms ★★ code review trivial
  T0.3 qwen3:30b            18GB ~250ms ★★★ reasoning local heavy
  T0.4 gemma3:12b           12GB ~200ms ★★★ general purpose
  T0.5 deepseek-r1:7b       7GB  ~180ms ★★★★ reasoning chain

TIER 1 (HAIKU CLOUD):
  T1.1 haiku-4.5            $0.25/M  ~250ms
  T1.2 haiku-4-5-20251001   $0.30/M  ~270ms (snapshot)

TIER 2 (SONNET CLOUD):
  T2.1 sonnet-4.6           $3/M     ~1.5s
  T2.2 sonnet-4.5           $2.50/M  ~1.4s (if available)

TIER 3 (OPUS CLOUD):
  T3.1 opus-4.6             $15/M    ~3s
  T3.2 opus-4.7             $20/M    ~3.5s
  T3.3 opus-4.8             $25/M    ~4s
```

### Pricing policy decisão

- **classify.js continue 4-tier (simplicity)** — output T0/T1/T2/T3
- **Sub-tier escolha dentro do tier** = configurable em preferences:
  ```json
  {
    "tier_models": {
      "T0": ["qwen3:30b", "qwen2.5-coder:14b", "qwen2.5:3b"],
      "T1": "haiku-4.5",
      "T2": "sonnet-4.6",
      "T3": "opus-4.7"
    }
  }
  ```
- **Statusline mostra realised tier+model+cost** — `T3.2 opus-4.7 $0.04/turn`

### Pastor learning impact

- Pastor learning continua per `(intent_class, complexity)`
- Mas adiciona **sub-tier specific accuracy** tracking
- Permite "model A better than model B for class X" insights

---

## §7 Decisão sub-tiers (Paulo escolheu / Cowork assume Opção B 2026-06-08)

**Wave 33.7 SHIPPED v1.21.3-landing-enhance** (~11m35s CC) com 2 doctrine catches honest.

**Para Wave 33.8 arrancar "sem parar"** (request Paulo), Cowork assume **Opção B** (model+cost explicit, mantém 4 tiers):

### Why Opção B vence Opção A + C

- **Balance simplicity + transparency:** classify.js continue 4-tier; statusline mostra realised model + cost
- **Backward compatible:** Wave 28-33.7 packages INTOCADOS
- **Pastor learning unaffected:** Algorithm fixed, data growing
- **User clarity:** "T3 opus-4.7 $0.04/turn" mostra realidade sem explodir cardinality

### Statusline chip patterns Wave 33.8

```
Line 1: 🐮 saved $X · last 10 · T3 opus-4.7 · conf 0.75   ← model name explicit
Line 2: ... · 🪙 T0:0 (qwen3:30b) · T1:0 · T2:0 · T3:263.8k (opus-4.7) ...   ← tokens chip enriched
Line 3: ... · 🪟 paulo-1338 (3 active) · 🐙 @pauloloureiroshp-ship-it ...   ← cross-terminal + user GitHub
```

---

## §8 Wave 33.8 brief FINAL (statusline 2.0)

**Tag esperada:** `v1.21.4-statusline-2.0`
**Estimate:** 3-4h CC autonomous (ultracode + dangerous)
**Owner:** Paulo (CC executor) · doutrina T0/T1/T2/T3 + scratchpad activo
**classify.js sha:** `7b01eb86…87762` INTACT obrigatório (18 waves consecutive)

### §8.1 Cabeçalho operacional

| Item | Valor |
|---|---|
| Branch base | `main @ e5f4d16` (Wave 33.7 ship) |
| Branch feature | `wave33_8-statusline-v2` |
| Tag pré-merge | ❌ NÃO criar |
| Tag pós-merge | `v1.21.4-statusline-2.0` |
| Wave 28-33.7 packages | **INTOCADOS** |
| `landing/` Next.js 15 prod | INTOCADO (visual update apenas) |
| `landing-v12-deploy/` | INTOCADO |
| Doutrina | Honest > forced. Day 0 recon. final-reviewer Opus gate. |

### §8.2 Day 0 recon (~30 min)

1. classify.js sha INTACT
2. Wave 28-33.7 packages all present + untouched
3. statusline-multi.js current architecture (entry points, modes, chip registry)
4. Identify all chip source files in `tools/router/*-status.js`
5. Identify mlwr_snapshot.json + savings_calc.json paths + write timings
6. Hub `/v1/user/dashboard` shape (Wave 33.7 endpoint)
7. Conductor heartbeat path + format
8. Workflow Engine state files + paths
9. Supabase session cookie reading (server-side hint)
10. User GitHub handle storage location (from Wave 33.7 OAuth flow)

**Output:** `docs/strategy/WAVE33_8_DAY0_RECON.md`

### §8.3 8 Blocks ordenados

#### Block A — Sync sanity check (~30 min, T2)
- `mooter doctor` adds check: statusline alltime stats vs hub D1 events alltime
- If drift >5%, alert + fix cmd: `mooter sync --rebuild-stats`
- Fixes Q7 + Q10 (discrepância alltime $0.00 vs real $25.95)

#### Block B — Sessions count chip (~45 min, T2)
- New chip: `🪟 paulo-1338 (3 active)`
- Reads `~/.mooter/orchestration/heartbeats/*.json` (Wave 33.5 Conductor)
- Failure-safe: any error → just show current name silent
- Hide via `mooter quiet --hide-sessions-count`
- Fixes Q5 cross-terminal visibility

#### Block C — Conductor + Workflow integration (~1.5h, T3 Opus)
- Workflow runner acquires Conductor lock antes de tool calls perigosos (git/Notion/deploy/npm publish)
- Workflow state inclui `locks_held: [git-frugal-hash, notion]`
- New chip combinado: `🔄 wf-abc 3/7 💠💠💠○○○○ 🔒 git+notion · 4.2k tk`
- Sessions watch TUI mostra workflow IDs per session card
- Fixes Q6 + Q9

#### Block D — Dedupe RTX 4090 (~15 min, T1)
- Remove `🐍 nvidia-rtx-4090` from Line 3 OR enriquecer com driver+CUDA
- Recommended: enriquecer (`🐍 NVIDIA 560.35 · CUDA 12.4`) — Line 2 mostra VRAM, Line 3 driver
- Fixes Q9

#### Block E — User GitHub chip (~30 min, T1)
- Create `tools/router/user-status.js`
- Reads Supabase session cookie (server-side reader) OR `~/.mooter/auth/session.json` (local cache)
- Chip: `🐙 @handle` quando logged in, silent quando logged out (privacy default)
- Hide via `mooter quiet --hide-user`
- Fixes Q10

#### Block F — Model+cost explicit (Opção B) (~1h, T2)
- statusline-multi.js Line 1: tier chip mostra model name (`T3 opus-4.7` em vez de só `T3 opus`)
- Line 2: `🪙 T0:0 (qwen3:30b) · T1:0 (haiku-4.5) · T2:0 · T3:263.8k (opus-4.7) · session $0.04/turn`
- Pricing table em `tools/router/pricing.ts` (Wave 33 already shipped); chip lê desse
- Fixes Q11

#### Block G — MLWR empty state (~10 min, T1)
- When snapshot ausente, chip mostra: `📚 MLWR · run benchmark`
- Em vez de chip silent (current behavior)
- Helps user understand chip + invites action

#### Block H — Labels correct all-time vs session (~20 min, T1)
- "all-time" só quando truly all-time (from hub D1 events sum)
- "this session" quando current
- Compatible com Block A sync sanity check
- Fixes Q7 + Q10 root cause

### §8.4 Acceptance gates

- [ ] classify.js sha `7b01eb86…87762` INTACT pré + post-merge (18 waves)
- [ ] Wave 28-33.7 packages INTOCADOS via `git diff --stat`
- [ ] `landing/` + `landing-v12-deploy/` INTOCADOS
- [ ] Statusline budget ≤10ms preserved (regression test)
- [ ] No existing chip behavior breaks (snapshot test)
- [ ] sync sanity check detects 5% drift
- [ ] Cross-terminal count visible em chip
- [ ] Workflow + Conductor integration: race-condition synthetic test passes
- [ ] User chip respects privacy (silent logged-out by default)
- [ ] Model+cost explicit in chips Line 1 + Line 2
- [ ] `final-reviewer` Opus SHIP sem high severity
- [ ] Notion sub-page criada via MCP
- [ ] PR feature → main mergeado directo
- [ ] **SÓ ENTÃO** tag `v1.21.4-statusline-2.0` + push
- [ ] MEMORY.md + SYNC.md updated

### §8.5 Master prompt para Paulo arrancar

```
Lê STATUSLINE_AUDIT_AND_2_0_PROPOSAL.md §8 em docs/strategy/ e executa como master prompt completo desta sessão em modo ultracode + dangerous autonomous.

Order:
1. Day 0 honest recon (10 pontos — output em docs/strategy/WAVE33_8_DAY0_RECON.md)
2. Block A — sync sanity check (~30 min, T2)
3. Block B — sessions count chip (~45 min, T2)
4. Block C — Conductor + Workflow integration (~1.5h, T3 Opus)
5. Block D — dedupe + enrich RTX 4090 chip (~15 min, T1)
6. Block E — user GitHub chip (post Wave 33.7) (~30 min, T1)
7. Block F — model+cost explicit em chips Line 1+2 (Opção B) (~1h, T2)
8. Block G — MLWR empty state better message (~10 min, T1)
9. Block H — labels correct all-time vs session (~20 min, T1)
10. Pre-merge gates universais + final-reviewer Opus + merge wave33_8-statusline-v2 → main directo + tag v1.21.4-statusline-2.0 + Notion + MEMORY + SYNC update

Doctrine critical:
- classify.js sha 7b01eb86...87762 sagrada (18 waves consecutivas)
- Wave 28-33.7 packages INTOCADOS
- landing/ Next.js 15 prod INTOCADO (visual update apenas em chips)
- landing-v12-deploy/ INTOCADO (preserve preview.mooter.ai)
- Statusline budget ≤10ms preservado (regression test)
- No existing chip behavior breaks (snapshot tests)
- Privacy first em user chip (silent logged-out default)
- Sub-tier decision = Opção B (model+cost explicit em chips Line 1+2, mantém 4-tier macro)
- Honest > forced em todos deliverables

Vai.
```

---

*Audit composto 2026-06-08 enquanto CC faz final-reviewer Wave 33.7. Source MLWR confirmado em tools/router/mlwr-status.js. Statusline 2.0 brief draft pronto para refine baseado em Paulo decisions. **Honest > inflated. Real numbers. Transparency aumenta confiança.** 🐮*
