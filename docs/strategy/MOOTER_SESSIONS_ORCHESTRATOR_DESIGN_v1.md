# Mooter Sessions Orchestrator — Design Spec v1 (state-of-the-art 2026-06-08)

> **TL;DR:** Mooter NÃO compete com Composio AO / Conductor / Claude Squad / Vibe Kanban. Mooter é a **camada invisível de cross-session intelligence** que torna esses orchestrators mais baratos, mais inteligentes, e mais conscientes. Mission: "Mooter sees every Claude Code session, everywhere, learns from all of them, and tells you when one is bleeding money." Tag esperada: `v1.21.1-sessions-orchestrator` (Wave 33.5) ou `v1.22.0-sessions-orchestrator` (Wave 34 elevado).

---

## §1 Problem statement (a verdade nua)

Paulo (e qualquer power-user Claude Code 2026) tem dor real:

- **3-8 terminais abertos simultaneamente** com Claude Code em waves diferentes
- **Quota Anthropic 5h Max é PARTILHADA** entre todas sessões — uma sessão Opus heavy pode quebrar TODAS as outras
- **Cada sessão tem o seu Pastor learning isolado** — saving signals não se propagam
- **Worktrees acumulam-se** — `git worktree list` cresce, branches stale ficam órfãs
- **Cost mental load**: "qual sessão está bleeding $$$?", "qual já terminou?", "qual está stuck?"
- **No single pane of glass**: Mooter dashboard mostra agregado, mas não per-session live

Industry está a resolver isto desde April 2026 — convergência massiva de orchestrators (ver §3) — mas todos focam no **DOING** (spawn agents, run tasks). Falta a camada de **OBSERVING + OPTIMISING**.

**Mooter angle**: ser a camada de observabilidade + cost intelligence + Pastor cross-session learning que **complementa** os orchestrators existentes. Mooter NÃO substitui Conductor/Composio AO — torna-os mais inteligentes.

---

## §2 Why now (timing perfeito)

| Sinal | Data | Implicação |
|---|---|---|
| Anthropic ship Agent Teams + worktree auto Claude Code Desktop | 2026-04-14 | Multi-session é mainstream, não nicho |
| Composio AO launch (dashboard localhost:3000) | 2026-03 | Orchestrator-as-service é categoria |
| OpenAI Codex parallel cloud sandboxes | 2026-04 | Cross-vendor pressure |
| Kilo Code multi-session orchestration | 2026-04 | IDE-embedded competition |
| Conductor (Melty team) | 2026-04 | VC-backed entrants |
| Vibe Kanban launch | 2026-04 | Kanban-as-orchestrator UX |
| Claude Squad shipping | 2026-04 | Multi-Claude Claude orchestrator nicho |
| Antigravity | 2026-04 | Heavyweight enterprise play |
| Cursor Background Agents | 2026-04 | IDE giants entering |
| Termdock launch (multiplexer for AI agents) | 2026-05 | Multiplexer especialização AI agents |
| Zellij 0.26 (WASM plugin system, floating panes) | 2026-05 | TUI infrastructure ready |
| Claude Code Routines (scheduled cloud) | 2026-05 | Cloud automation pattern |
| GitHub issue #31901 Anthropic CC Zellij native | 2026-04 | Community demanding multiplexer integration |

**Conclusão:** April-May 2026 = inflection point. Mooter entra como **value-add layer**, não como concorrente directo.

---

## §3 Estado da arte (paisagem competitiva)

### 3.1 Three-tier classification (Augment Code 2026 framework)

| Tier | Profile | Examples | Mooter relação |
|---|---|---|---|
| **Tier 1** Solo agent | One agent at a time | Claude Code raw, Cursor | Mooter routes within single agent |
| **Tier 2** Worktree orchestrators | 3-10 agents isolated, dashboards | Composio AO, Conductor, Claude Squad, Vibe Kanban | **Mooter complementa** (observability + savings) |
| **Tier 3** Cloud-scale | 30+ agents, autonomous | OpenAI Codex cloud, Anthropic Routines | Mooter scales to inform router decisions across cloud |

### 3.2 Direct competitors (não confundir com Mooter)

| Tool | Categoria | Mooter overlap | Threat level |
|---|---|---|---|
| **Composio AO** | Agent orchestrator (spawn, CI fix, PR open) | Zero (eles spawnam, Mooter routea) | Low — pode integrar |
| **Conductor** (Melty) | Multi-agent kanban | Zero | Low |
| **Claude Squad** | Multi-Claude orchestrator | Zero | Low |
| **Vibe Kanban** | Kanban UI para agents | Zero | Low |
| **Antigravity** | Enterprise heavyweight | Zero | Low (target different) |
| **Anthropic Agent Teams** | Native CC multi-session | Mínimo (Mooter senta abaixo) | **None** — INTEGRAR |
| **Cursor Bg Agents** | IDE-embedded | Zero (Cursor != CC) | None |
| **Termdock** | Multiplexer specifically for AI agents | Sim (multiplexer layer) | **MED** — Mooter precisa ter opinião |

### 3.3 Terminal multiplexers (infra layer)

| Tool | Strengths 2026 | Mooter fit |
|---|---|---|
| **Zellij 0.26** | Floating panes · WASM plugins · always-visible keybind bar | ✅ **FIRST-CLASS** — Mooter pode shipar Zellij plugin oficial |
| **tmux 3.3** | Mature · scriptable · remote-SSH-strong · plugin ecosystem | ✅ Support obrigatório (legacy) |
| **WezTerm** | GPU · built-in multiplexing · Lua config | 🟡 Support secundário |
| **Warp** | AI-native, cloud-sync | 🟡 Mooter pode oferecer Warp Drive plugin |
| **Termdock** | AI-agent-specific multiplexer | ⚠️ Avaliar parceria ou compete |

### 3.4 Claude Code-native (Anthropic April 2026 ship)

- ✅ Desktop app sidebar para multi-session management
- ✅ Drag-and-drop layout workspaces
- ✅ Integrated terminal + file editor
- ✅ Auto-worktree per session
- ✅ Routines (scheduled cloud tasks)

**O que Anthropic NÃO faz (Mooter angle):**
- ❌ Cross-session savings calculation
- ❌ Cross-session Pastor learning
- ❌ Quota 5h awareness compartilhada
- ❌ Routing intelligence per-session (Opus vs Sonnet vs Haiku vs Ollama)
- ❌ Cost cap enforcement cross-session
- ❌ Workflow handoff (Wave 28 engine) cross-session
- ❌ LoRA adapter sharing across sessions
- ❌ Mission Control visual ÚNICO

**Esses gaps são os 8 vectores Mooter Sessions Orchestrator.**

---

## §4 Mooter positioning (one-liner para landing)

> **"Mooter is the cross-session intelligence layer for Claude Code. Every session you open, everywhere, with any orchestrator, becomes part of one learning system that saves you 47% and tells you when you're about to hit the 5h quota wall."**

### 4.1 Não-objectivos explícitos

- ❌ NÃO spawnar agents (Composio AO faz isso)
- ❌ NÃO substituir Anthropic Agent Teams (integramos)
- ❌ NÃO replace tmux/Zellij (somos plugin, não multiplexer)
- ❌ NÃO ser cloud-orchestrator competitor (local-first doctrine)
- ❌ NÃO controlar process lifecycle (CC controla, nós observamos)

### 4.2 Vectores únicos (USPs)

1. **Cross-session savings calc** — única fonte de verdade
2. **Quota 5h awareness compartilhada** — "TERM 3 vai consumir 65% se continuar em Opus pelos próximos 30 min"
3. **Pastor learning agregado** — decisões em TERM 1 informam TERM 2 routing
4. **Workflow Engine handoff cross-session** — Wave 28 motor pode passar workflow entre sessões
5. **LoRA adapter sharing** — Multi-LoRA serve 6 adapters concurrent para todas sessões
6. **Cost cap cross-session** — Ultramoo mode pode aplicar cap global a TODAS sessões abertas
7. **Privacy-first opt-in** — k-anon ≥50, federated wisdom opcional
8. **Plugin-friendly** — Zellij plugin, tmux plugin, WezTerm config, Warp integration

---

## §5 Arquitectura fit (V5 layers afectadas)

```
┌─────────────────────────────────────────────────────────────────┐
│ L16 Prompt Quality Intelligence                                 │
│ L15 Ecosystem Intelligence  ◄── reads sessions state             │
│ L14 User Setup Intelligence                                     │
│ L13 GDPR / Privacy           ◄── per-session opt-out             │
│ L12 Transparency Layer       ◄── per-session metrics surface    │
│ L11 Real-time Arbitrage      ◄── cross-session quota-aware       │
│ L10 Federated Wisdom         ◄── opt-in aggregate hub            │
│ L9  Telemetry                                                    │
│ L8  Workflow Engine (Wave 28) ◄── cross-session handoff          │
│ L7  Packs                                                        │
│ L6  Pastor v2 LORAUTER       ◄── cross-session learning          │
│ L5  Multi-LoRA Serving       ◄── 6 adapters all sessions         │
│ L4  Quant / Speculative      ◄── shared GPU memory               │
│ L3  Cost Cap / Ultramoo      ◄── global cross-session enforce    │
│ L2  Classify.js (INTACT)                                         │
│ L1  Routing Decision                                             │
│ L0  Cache / Memo                                                 │
└─────────────────────────────────────────────────────────────────┘

NEW: L8.5 SESSIONS ORCHESTRATOR ROOM
     ├─ Sessions Watcher (poll JSONL + worktrees)
     ├─ Cross-session aggregator
     ├─ Ralph Mission Control TUI
     ├─ Zellij/tmux/WezTerm integration adapter
     └─ Browser bridge (optional, mooter.ai/sessions)
```

### 5.1 Package architecture

**Novo package:** `@mooter/sessions-orchestrator`

```
packages/sessions-orchestrator/
├── src/
│   ├── watcher.ts             # Poll JSONL + git worktree list
│   ├── aggregator.ts          # Cross-session metrics + Pastor signals
│   ├── tui/
│   │   ├── ralph_sessions.ts  # Ralph-style TUI (reuse Wave 32 E patterns)
│   │   ├── widgets/
│   │   │   ├── SessionCard.ts
│   │   │   ├── QuotaForecast.ts
│   │   │   ├── PastorAgg.ts
│   │   │   └── CostCap.ts
│   │   └── layout.ts          # Terminal width responsive
│   ├── integrations/
│   │   ├── zellij_plugin.ts   # Zellij WASM plugin glue
│   │   ├── tmux_plugin.ts     # tmux plugin manager compat
│   │   ├── wezterm_lua.ts     # WezTerm Lua snippets
│   │   ├── warp.ts            # Warp Drive integration
│   │   └── cc_agent_teams.ts  # Anthropic CC sidebar bridge
│   ├── browser/
│   │   ├── server.ts          # Local WebSocket bridge (optional)
│   │   └── public/            # mooter.ai/sessions live page
│   ├── lifecycle/
│   │   ├── reaper.ts          # Worktree cleanup helper
│   │   └── handoff.ts         # Workflow cross-session handoff
│   └── index.ts
├── tests/                      # ~30 tests target
└── package.json
```

### 5.2 Data sources (existing, no breaking)

| Source | What | Already shipped |
|---|---|---|
| `~/.claude/projects/**/sessions/*.jsonl` | CC sessions birth+activity | ✅ Native CC |
| `git worktree list --porcelain` | Worktree → branch mapping | ✅ Git |
| `~/.mooter/events.db` | Local events (Wave 26+) | ✅ Wave 26 |
| `~/.mooter/preferences.json` | User config | ✅ Wave 32 |
| `~/.mooter/quota_state.json` | Anthropic 5h tracker | ✅ Wave 32 G |
| `~/.mooter/pastor_state.json` | LORAUTER state | ✅ Wave 31 |
| Hub `/v1/events` | Cross-device agg (opt-in) | ✅ Wave 26 |
| `~/.mooter/savings_calc.json` | Per-session $ saved | ✅ Wave 14 |

### 5.3 Wave 28 Workflow Engine reuse

**Cross-session workflow handoff** (USP #4):
- Session A finishes "Day 0 recon" workflow → output as artifact
- Session B picks up artifact + runs "Day 1 implementation" workflow
- Mooter orquestra handoff sem CC interaction (background)

**Mechanism:** Workflow Engine Wave 28 já tem isolated-vm sandbox. Adicionar:
- `mooter workflow handoff <from-session-id> <to-session-id>`
- Workflow artifact path: `~/.mooter/workflows/handoff/<id>.artifact.json`
- Auto-cleanup após 24h

### 5.4 Pastor cross-session learning (USP #3)

**Hoje (Wave 31):** cada sessão tem o seu próprio Pastor state, learning local.

**Wave 33.5 add:** aggregator que faz merge dos pastor_states ao longo das sessões locais (k-anon não necessária, é tudo local).

```ts
// Pseudocode
const allSessions = listLocalSessions();
const aggregated = mergeDecisionsByTaskType(allSessions);
// "wave33 ultimate task type" agora tem N decisões em vez de só desta sessão
const adapter = LORAUTER.suggest(prompt, aggregated);
```

**Result:** sessão recém-criada já tem benefício do learning de todas anteriores. Cross-session intelligence material.

---

## §6 CLI surface design (full spec)

### 6.1 Comandos novos (`mooter sessions <sub>`)

```bash
# OBSERVABILITY
mooter sessions list                  # tabela aged + tier + savings
mooter sessions list --active         # só sessões com activity últimos 5min
mooter sessions list --json           # output JSON para scripting
mooter sessions list --tree           # group by worktree

mooter sessions watch                 # Ralph-style TUI live (DEFAULT)
mooter sessions watch --refresh-ms 2000
mooter sessions watch --filter "wave33"

mooter sessions show <id>             # detail de uma sessão (last 10 prompts, tier breakdown)
mooter sessions diff <id1> <id2>      # compare 2 sessions

# QUOTA
mooter sessions quota                 # quota 5h forecast based on active sessions
mooter sessions quota --warn-at 80    # alert quando reach 80%

# COST CAP CROSS-SESSION (Ultramoo extension)
mooter sessions cost-cap set 5.00     # global cap $5 across all sessions
mooter sessions cost-cap status

# WORKTREE HYGIENE
mooter sessions worktrees             # list git worktrees + corresponding sessions
mooter sessions worktrees clean       # interactive cleanup stale worktrees
mooter sessions worktrees prune       # git worktree prune wrapper

# HANDOFF (Workflow Engine integration)
mooter sessions handoff <from> <to>   # transfer workflow artifact
mooter sessions handoff list          # active handoffs

# LIFECYCLE
mooter sessions kill <id> --graceful  # signal CC to terminate (non-destructive)
mooter sessions focus <id>            # output cmd to switch terminal (printf TMUX cmd or osascript)

# INTEGRATIONS
mooter sessions plugin install zellij # install Zellij plugin
mooter sessions plugin install tmux   # install tmux plugin
mooter sessions plugin install warp   # install Warp Drive integration
mooter sessions browser               # open browser dashboard mooter.ai/sessions

# EXPORT (GDPR-compatible)
mooter sessions export                # all sessions metadata (no prompts)
mooter sessions export --include-prompts --confirm  # full export with confirm
```

### 6.2 Slash commands (`/moo-sessions-*`)

Skills criadas em `.claude/skills/`:
- `/moo-sessions` → invoke `mooter sessions watch`
- `/moo-sessions-list` → invoke `mooter sessions list`
- `/moo-sessions-quota` → invoke `mooter sessions quota`
- `/moo-sessions-handoff` → invoke `mooter sessions handoff`

Total slash commands: 8 (Wave 32) + 4 = **12 `/moo-*` commands**.

### 6.3 MCP tools novos

Adicionar a `packages/mcp-server/src/tools.ts`:
- `mooter_sessions_list` (returns active sessions)
- `mooter_sessions_quota_forecast` (returns predicted 5h burn rate)
- `mooter_sessions_handoff` (transfer workflow artifact)
- `mooter_sessions_pastor_aggregate` (cross-session Pastor signal)

Total MCP tools: 12 (Wave 32) + 4 = **16 MCP tools**.

---

## §7 UX/UI design (mockups)

### 7.1 `mooter sessions watch` — Ralph-style TUI

```
┌─ 🐮 Mooter Sessions Orchestrator · 3 active · ☁ 47% / 5h ────────────────────────┐
│                                                                                    │
│ ┌─ [1] wave33-ultimate     ★ ACTIVE     2h14m     T3 opus    77/$0.09 ──────┐    │
│ │  /mnt/c/Users/Paulo/frugal · worktree: main                               │    │
│ │  Last prompt 14s ago: "valida o build/typecheck do CLI..."                │    │
│ │  Block A: ████████░░ 80%       est. 32 min remaining                      │    │
│ │  Pastor sugere: stay T3 (high confidence learning)                        │    │
│ │  Cost projection 5h: $0.47   Quota share: 38%                             │    │
│ └────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                    │
│ ┌─ [2] wave34-llmlingua-exp   💤 idle 12min   47m12s   T2 sonnet   23/$0.04 ┐    │
│ │  ~/mooter-wave34 · worktree: wave34-llmlingua-exp                        │    │
│ │  Last prompt 12m ago: "explora arquitectura LLMLingua hardening..."     │    │
│ │  No active task                                                          │    │
│ │  Cost projection 5h: $0.12   Quota share: 8%                            │    │
│ │  ⚠️ Idle >10min — consider closing? [k] kill  [r] resume                  │    │
│ └──────────────────────────────────────────────────────────────────────────┘    │
│                                                                                    │
│ ┌─ [3] mooter-hotfix-landing  🟢 fresh   4m20s   T1 haiku    3/$0.01 ────────┐    │
│ │  ~/mooter-hotfix · worktree: bugfix-landing-copy                          │    │
│ │  Last prompt 4s ago: "audit landing copy bug em /how-it-works..."        │    │
│ │  Block 1: ███░░░░░░░ 30%       est. 8 min remaining                       │    │
│ │  Pastor sugere: stay T1 (copy edits are cheap)                            │    │
│ │  Cost projection 5h: $0.04   Quota share: 1%                              │    │
│ └────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                    │
│ ─── GLOBAL ────────────────────────────────────────────────────────────────────── │
│ Quota Anthropic 5h: 47% used · est. lock at 02:47 BRT (1h12m remaining)            │
│ Cross-session $ saved today: $0.14 (47% vs all-Opus) · alltime $29.34              │
│ Pastor agg signal: T3 frequent → consider Ultramoo mode for new sessions           │
│                                                                                    │
│ ─── KEYBINDS ───────────────────────────────────────────────────────────────────── │
│ [↑/↓] navigate · [Enter] show details · [w] worktree list · [k] kill session      │
│ [f] focus terminal · [h] handoff workflow · [q] quit · [?] help                    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 `mooter sessions list` — compact table

```
$ mooter sessions list

ID  STATE     AGE      WORKTREE                    TIER    CALLS   $SAVED   LAST PROMPT
1   ★ active  2h14m    main                        T3      77      $0.09    "valida build/typecheck..."
2   💤 idle   47m12s   wave34-llmlingua-exp       T2      23      $0.04    "explora LLMLingua..."
3   🟢 fresh  4m20s    bugfix-landing-copy         T1      3       $0.01    "audit landing copy..."

3 sessions · 103 calls · $0.14 saved (47% vs all-Opus baseline)
Quota: ☁ Claude Max 47% / 5h · est. lock 02:47 BRT
```

### 7.3 `mooter sessions quota` — forecast view

```
$ mooter sessions quota

╭─ Anthropic 5h Quota Forecast ────────────────────────────╮
│                                                            │
│ Current:    ████████░░░░░░░░░░░░  47% (2h21m used)        │
│ Forecast:   ███████████████░░░░░  78% (4h12m if continue) │
│ Lock at:    02:47 BRT (1h12m remaining)                   │
│                                                            │
│ Per-session contribution:                                  │
│   [1] wave33-ultimate     38% (active heavy T3)           │
│   [2] wave34-llmlingua    8%  (idle, low burn)            │
│   [3] mooter-hotfix       1%  (T1 only)                   │
│                                                            │
│ Recommendation:                                            │
│   ✓ [1] is on track                                       │
│   ⚠ Consider closing [2] if not resuming                  │
│   ✓ [3] is safe                                           │
│                                                            │
│   Or set global cost-cap to enforce:                      │
│     mooter sessions cost-cap set 1.00                     │
│                                                            │
╰────────────────────────────────────────────────────────────╯
```

### 7.4 Browser bridge (optional, opt-in) — `mooter.ai/sessions/live`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🐮 Mooter Sessions Live                                                       │
│ Connect local device ▼                                              [☰ menu]│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ [Card grid view] [Table view] [Worktree tree view]      Auto-refresh: 5s   │
│                                                                             │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐                                  │
│ │ Session 1│  │ Session 2│  │ Session 3│                                  │
│ │ ★ active │  │ 💤 idle  │  │ 🟢 fresh │                                  │
│ │ 2h14m    │  │ 47m12s   │  │ 4m20s    │                                  │
│ │ T3       │  │ T2       │  │ T1       │                                  │
│ │ $0.09    │  │ $0.04    │  │ $0.01    │                                  │
│ └──────────┘  └──────────┘  └──────────┘                                  │
│                                                                             │
│ ─── Quota forecast ─── Cross-session savings ── Pastor agg ──              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Privacy:** browser bridge é OPT-IN, local-only WebSocket (127.0.0.1:13390), zero data sai do device. URL pública `mooter.ai/sessions/live` é uma SPA que conecta ao bridge local — sem servidor remoto.

### 7.5 Zellij plugin layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Pane 1: CC Session 1 (wave33)        │ Pane 2: CC Session 2     │
│                                       │                          │
│                                       │                          │
├──────────────────────────────────────┴──────────────────────────┤
│ Pane 3: CC Session 3 (hotfix)        │ Floating: Mooter Sessions│
│                                       │   ┌─ Watch TUI ─┐        │
│                                       │   │ 3 sessions  │        │
│                                       │   │ ☁ 47% / 5h  │        │
│                                       │   └─────────────┘        │
└──────────────────────────────────────┴──────────────────────────┘
```

Zellij floating panes são perfeitos — Mooter session watch overlay sem disrupt as CC sessions.

---

## §8 Skills inventory

### 8.1 Skills to GRAB (já existem, integrar)

| Skill | Source | Purpose |
|---|---|---|
| `web-artifacts-builder` | Anthropic | Para browser bridge SPA `mooter.ai/sessions/live` |
| `mcp-builder` | Anthropic | Para 4 novos MCP tools |
| `pdf` / `docx` | Anthropic | Para `mooter sessions export` formats |
| `consolidate-memory` | Anthropic | Para Pastor aggregation patterns reference |
| `design:design-system-management` | Cowork | Para landing page Mooter sessions section |
| `design:design-handoff` | Cowork | Para spec da landing v33.5 |
| `product-management:feature-spec` | Cowork | Para PRD Sessions Orchestrator |

### 8.2 Skills to CREATE (Mooter-specific)

**Skill 1: `mooter-sessions-pack`**
- Pack instalável: `mooter pack install sessions-orchestrator`
- Contém: Zellij layout KDL + tmux conf snippets + WezTerm Lua snippets + browser bridge launcher
- Skill SKILL.md ensina CC como invoke

**Skill 2: `mooter-worktree-discipline`**
- Skill que ensina CC a usar `mooter sessions worktrees` cmds proativamente quando o user cria múltiplas branches
- Naming convention enforcement: `../mooter-<purpose>`
- Auto-suggestion para `git worktree remove` quando branch merged

**Skill 3: `mooter-quota-aware-routing`** (extensão de Pastor)
- Quando próxima de quota limit, Pastor bias T3 → T2/T1 mais agressivo
- Slash command: `/moo-quota-emergency` força Ultramoo mode em todas sessões abertas

### 8.3 Cowork plugin candidato

**Plugin name:** `mooter-sessions-coplugin`

**Components:**
- 1 skill: `mooter-sessions-discipline` (workflow guidance)
- 1 MCP server: `mooter-sessions-mcp` (4 tools)
- 1 command: `/sessions-audit` (interactive Cowork sessions audit)

**Distribution:** plugin marketplace Anthropic (Wave 35 candidate).

---

## §9 Integration points (concrete)

### 9.1 Claude Code Agent Teams integration

Claude Code Desktop App April 2026 ship tem sidebar nativa para sessions. **Mooter integra via:**

1. **CC settings hook** — Mooter regista hook `SessionStart` em `~/.claude/settings.json` que regista session em `~/.mooter/sessions_active.json`
2. **CC sidebar plugin** (futuro, depende Anthropic plugin API) — Mooter widget na sidebar mostra savings live
3. **CC `/sessions` cmd compat** — Mooter intercepta e adiciona Mooter data

**Reference:** Anthropic GitHub issue #31901 mostra que Anthropic está aberto a multiplexer integration.

### 9.2 Zellij plugin (priority 1)

**Tipo:** WebAssembly plugin (Zellij plugin API).
**Build:** Rust → wasm32-wasi.
**Install:** `mooter sessions plugin install zellij` copia .wasm para `~/.config/zellij/plugins/`.
**Config:** Auto-adiciona `mooter-sessions` layout em `~/.config/zellij/layouts/`.
**Floating pane keybind:** `Ctrl+Alt+M` → toggle Mooter sessions watch overlay.

### 9.3 tmux plugin (priority 2)

**Tipo:** TPM-compatible (tmux plugin manager).
**Repo:** `mooter-tmux-sessions` (mooter-org).
**Install:** `mooter sessions plugin install tmux` adiciona linha a `~/.tmux.conf`.
**Statusline integration:** mostra `🐮 3 sessions $0.14 saved` no tmux status-right.

### 9.4 WezTerm Lua snippet (priority 3)

**Tipo:** Lua module imported em `wezterm.lua`.
**Install:** `mooter sessions plugin install wezterm` cria `~/.config/wezterm/mooter.lua` + linha de require.
**Features:** Tab title format `🐮 Wave 33 · T3 · $0.09`, color coding tier.

### 9.5 Warp integration (priority 4)

**Tipo:** Warp Drive workflow + Warp Block Actions.
**Install:** `mooter sessions plugin install warp` deploy Warp Drive workflow.
**Features:** Block button "Show Mooter sessions" abre overlay.

### 9.6 Termdock evaluation

Termdock é multiplexer especificamente para AI agents. Avaliar:
- Termdock tem plugin API?
- Mooter pode shipar Termdock plugin?
- Ou Mooter compete com Termdock?

**Recomendação Day 0 Wave 33.5:** investigar Termdock + decidir parcerismo vs competição.

### 9.7 Cross-vendor (futuro Wave 35+)

Mooter pode aprender de Cursor/Codex sessions também (não só CC):
- Cursor: scan `~/.cursor/projects/**/sessions/*.jsonl`
- Codex: cloud API integration (auth opt-in)
- Generic LSP: futuro

---

## §10 Roadmap (phasing recommendation)

### Wave 33.5 — MVP Sessions Orchestrator (recommended)

**Tag:** `v1.21.1-sessions-orchestrator`
**Estimate:** 4-6h CC autonomous
**Scope (MVP):**
- `@mooter/sessions-orchestrator` package
- `mooter sessions list / watch / show / quota`
- Ralph-style TUI básico
- 4 MCP tools novos
- Workflow handoff básico (artifact transfer)
- ZERO integrations terceiros (Zellij/tmux deferred)

**Why MVP:** ship value rapido, validar Paulo usa diariamente, depois investir em integrations.

### Wave 34 — Integrations (Zellij + tmux first)

**Tag:** `v1.22.0-sessions-integrations`
**Estimate:** 6-8h CC autonomous
**Scope:**
- Zellij plugin (WASM, Rust build)
- tmux plugin (TPM compat)
- Statusline integration in both
- WezTerm Lua snippet (priority 3)
- Browser bridge SPA (mooter.ai/sessions/live)

### Wave 35 — Polish + Federated + Plugin marketplace

**Tag:** `v1.23.0-sessions-federation`
**Estimate:** 4-6h CC autonomous
**Scope:**
- Cross-device federated wisdom (k-anon ≥50, opt-in)
- Pastor aggregation cross-device
- Warp integration
- Cursor/Codex compat (read-only, opt-in)
- MCP marketplace listing
- Anthropic plugin official publish

### Wave 36+ — Termdock parceria, enterprise features

Deferred — depende validação Wave 33.5/34/35.

---

## §11 Landing page implications (talking points)

### 11.1 New landing sections

**Section: "One brain, every Claude Code session"**

> Mooter sees every Claude Code session you have open, everywhere on your machine. Cross-session savings calculation. Cross-session quota forecast. Cross-session Pastor learning. One brain, every session.

**Section: "Plug into any multiplexer"**

> Mooter ships native plugins for Zellij, tmux, WezTerm, and Warp. Floating overlay in Zellij. Statusline integration in tmux. Tab tinting in WezTerm. Block actions in Warp. Or run it standalone in any terminal — Mooter doesn't care.

**Section: "5h quota that doesn't surprise you"**

> Anthropic's 5h Claude Max quota is shared across all your parallel sessions. Mooter forecasts when you'll hit the wall based on current burn rate of every session, and tells you which one to pause first.

### 11.2 Hero CTA refresh

Current Wave 32 hero: "Local-first LLM router for Claude Code"

Wave 33.5+ hero candidates:
- **"Your LLM router. Local-first. Learns forever. Across every session."**
- **"One brain for every Claude Code session you have open."**
- **"Mooter sees every session. Saves you 47%. Learns forever."**

### 11.3 Comparison table refresh

| Feature | Composio AO | Conductor | Claude Squad | **Mooter** | Anthropic Agent Teams |
|---|---|---|---|---|---|
| Spawn agents | ✅ | ✅ | ✅ | ❌ (by design) | ✅ |
| Cross-session $ savings | ❌ | ❌ | ❌ | **✅** | ❌ |
| 5h quota awareness | ❌ | ❌ | ❌ | **✅** | ❌ |
| Pastor cross-session learning | ❌ | ❌ | ❌ | **✅** | ❌ |
| Workflow handoff | 🟡 | ❌ | ❌ | **✅** | ❌ |
| Local-first | ❌ | ❌ | 🟡 | **✅** | ✅ |
| GDPR data rights | ❌ | ❌ | ❌ | **✅** | 🟡 |
| Multiplexer plugins | ❌ | ❌ | ❌ | **✅** | 🟡 |
| Free / OSS | ❌ | ❌ | 🟡 | **✅** | ✅ |

### 11.4 Social proof angles (for friends-launch DMs v9)

> "Wave 33.5 do Mooter shippa hoje: cross-session intelligence. Tenho 3 sessões CC abertas e o Mooter mostra todas num só TUI, prevê quando vou hit 5h quota, e Pastor agrega learning. Não conheço outro tool que faça isto. Testas?"

### 11.5 Blog post outline (`BLOG_POST_WAVE33_5.md`)

1. **Why we built Sessions Orchestrator** (problem statement)
2. **The orchestrator space is crowded but missing observability** (state of art)
3. **Mooter complements, doesn't compete** (positioning)
4. **The 4 USPs** (cross-session $, quota, Pastor, handoff)
5. **Multiplexer plugin first-class** (Zellij focus)
6. **Privacy-first** (k-anon, opt-in, GDPR)
7. **Install + try** (CTA)

Length: ~1200 words. Cross-post: Substack + Dev.to + HN ("Show HN: Mooter Sessions Orchestrator").

---

## §12 Risks + mitigations

| Risco | Severidade | Mitigação |
|---|---|---|
| Anthropic ship competing feature em CC Desktop App | HIGH | Position Mooter as LAYER ABOVE — não competir. Focus em cross-session intelligence + Pastor learning + multiplexer plugins. |
| Composio AO ou Conductor adquirem Mooter angle | MED | Mooter privacy-first + local-first + free é defensible moat |
| Zellij plugin API changes break | MED | Pin Zellij version compat range, smoke test em CI |
| Cross-session JSONL scan slow em big projects | MED | Cache fs stat, debounce poll 5s, async stream parse |
| Privacy concerns (reads all CC sessions) | HIGH | Opt-in everywhere, GDPR data rights enforced, k-anon ≥50 federated |
| Worktree submodule edge cases | LOW | Document limitation, fallback gracioso |
| Quota forecast accuracy poor | MED | Day 0 calibration with Paulo real data, A/B test forecast vs reality |
| Termdock direct competitor | MED | Parceria proposta, ou Mooter mais simples (focado intelligence vs multiplexing) |
| Landing page complexity (too many features to communicate) | MED | Hero focused, deep-dive secondary pages |

---

## §13 Open questions (precisam Paulo input antes Wave 33.5 arranque)

1. **Browser bridge yes/no para MVP?** Recomendo NÃO (TUI primeiro), Wave 34 add.
2. **Zellij vs tmux plugin priority?** Recomendo Zellij first (modern, WASM, melhor UX).
3. **Federated cross-device Wave 33.5 ou Wave 35?** Recomendo Wave 35 (precisa hub schema mudanças significativas).
4. **Termdock parceria explorar agora?** Recomendo email founders + see reaction, low cost.
5. **Cowork plugin Anthropic submit Wave 33.5 ou 35?** Recomendo Wave 35 (precisa stability primeiro).
6. **CC Agent Teams integration depende Anthropic plugin API?** Recomendo email Anthropic team, ask roadmap.
7. **Mooter ship Warp Drive workflow?** Recomendo sim, fácil + bom marketing (Warp tem community grande).
8. **Hub data schema mudanças para sessions?** Avaliar Wave 33.5 Day 0 — preferir additive-only.

---

## §14 Documentation deliverables (Wave 33.5 ship)

| Doc | Owner | When |
|---|---|---|
| `MOOTER_OPERATIONS_GUIDE_v1.0.md` update §sessions | CC | Wave 33.5 closure |
| `docs/sessions-orchestrator/README.md` | CC | Wave 33.5 |
| `docs/sessions-orchestrator/zellij.md` | CC | Wave 34 |
| `docs/sessions-orchestrator/tmux.md` | CC | Wave 34 |
| `docs/sessions-orchestrator/privacy.md` | CC | Wave 33.5 |
| Landing page section /sessions | Paulo + CC | Wave 33.5 closure |
| Notion HQ sub-page Wave 33.5 | CC auto via MCP | Wave 33.5 closure |
| BLOG_POST_WAVE33_5.md | CC | Wave 33.5 Block E |
| TWEET_THREAD_WAVE33_5.md | CC | Wave 33.5 Block E |
| FRIENDS_LAUNCH_DMS_v9.md | CC | Wave 33.5 Block D |

---

## §15 Success metrics (definition of done Wave 33.5)

**MVP success criteria:**
1. ✅ Paulo runs `mooter sessions watch` daily during 2+ parallel CC sessions for 1 week
2. ✅ Quota forecast accuracy ≥80% (forecast vs actual lock time)
3. ✅ Cross-session $ saved aggregate matches sum of individual sessions ±5%
4. ✅ 30+ new unit tests
5. ✅ 0-HIGH / 0-MED final-reviewer Opus
6. ✅ classify.js sha INTACT
7. ✅ Bundle size <700 KB
8. ✅ Statusline budget ≤10ms preserved
9. ✅ Landing page section /sessions LIVE
10. ✅ At least 1 friend tries it within 48h of ship

**Stretch:**
- Termdock founders respond to outreach
- Anthropic acknowledges Mooter on CC plugin roadmap
- Hacker News post >50 upvotes
- 5+ GitHub issues opened by external users

---

## §16 Sources (web research 2026-06-08)

### Git worktrees
- [git-worktree official docs](https://git-scm.com/docs/git-worktree)
- [Git Worktree Best Practices 2026](https://www.gitworktree.org/guides/best-practices)
- [The Ultimate Guide to Git Worktrees: From Daily Dev to AI Agents](https://medium.com/@pererikbergman/the-ultimate-guide-to-git-worktrees-from-daily-dev-to-ai-agents-2b39e63a359d)
- [Git Workflow Best Practices: The Developer's Guide for 2026](https://dev.to/_d7eb1c1703182e3ce1782/git-workflow-best-practices-the-developers-guide-for-2026-4gl0)

### Claude Code multi-session
- [Run parallel sessions with worktrees — Claude Code Docs](https://code.claude.com/docs/en/worktrees)
- [Claude Code Desktop Redesign April 2026](https://miraflow.ai/blog/claude-code-desktop-redesign-parallel-sessions-routines-workspace-guide)
- [Mastering Git Worktrees with Claude Code for Parallel Development Workflow](https://medium.com/@dtunai/mastering-git-worktrees-with-claude-code-for-parallel-development-workflow-41dc91e645fe)
- [Claude Code Worktrees Guide (2026): Parallel Agents Without Conflicts](https://www.claudedirectory.org/blog/claude-code-worktrees-guide)
- [Parallel Claude Code Sessions with Git Worktrees: The Production Setup](https://www.codewithseb.com/blog/parallel-claude-code-sessions-git-worktrees-guide)
- [Run Parallel Claude Code Sessions](https://nimbalyst.com/parallel-claude-code-sessions/)
- [AI Coding Agent Dashboard: Orchestrating Claude Code Across Devices](https://blog.marcnuri.com/ai-coding-agent-dashboard)

### Terminal multiplexers
- [Zellij: The Modern Alternative to tmux (2026)](https://petronellatech.com/blog/zellij-terminal-multiplexer-guide-2026)
- [Terminal Multiplexers: tmux vs Zellij Comprehensive Comparison](https://dasroot.net/posts/2026/02/terminal-multiplexers-tmux-vs-zellij-comparison/)
- [tmux vs zellij: Which Wins in 2026](https://www.commandinline.com/tmux-vs-zellij-comparison/)
- [Using WezTerm Like tmux](https://zenn.dev/khasegawa/articles/a11ebfbabeabaa?locale=en)
- [tmux vs Termdock vs Zellij for AI Agents](https://www.termdock.com/en/blog/terminal-multiplexing-tmux-termdock-zellij)
- [Anthropic CC GitHub issue #31901 — Native Zellij support](https://github.com/anthropics/claude-code/issues/31901)

### Agent orchestrators
- [Composio Agent Orchestrator (AO)](https://github.com/ComposioHQ/agent-orchestrator)
- [The Code Agent Orchestra (Addy Osmani)](https://addyosmani.com/blog/code-agent-orchestra/)
- [9 Open-Source Agent Orchestrators for AI Coding (2026) — Augment Code](https://www.augmentcode.com/tools/open-source-agent-orchestrators)
- [Best Multi-Agent Coding Orchestrators in 2026 — amux](https://amux.io/blog/best-multi-agent-orchestrators-2026/)
- [Best Tools for Parallel AI Coding Agents (2026) — Nimbalyst](https://nimbalyst.com/blog/best-tools-for-running-parallel-ai-coding-agents/)
- [awesome-agent-orchestrators (GitHub)](https://github.com/andyrewlee/awesome-agent-orchestrators)
- [Agent Orchestration 101 — Lyzr](https://www.lyzr.ai/blog/agent-orchestration/)

---

## §17 Next steps (post-deepdive)

1. **Paulo review este doc** (~30 min leitura)
2. **Decisão Wave 33.5 vs 34 phasing** (recomendo Wave 33.5 MVP standalone, Wave 34 integrations)
3. **Open questions resolver** (§13 — 8 perguntas)
4. **Outreach Termdock founders** (low cost, high info)
5. **Compor `WAVE33_5_SESSIONS_ORCHESTRATOR_KICKOFF.md`** quando Wave 33 Ultimate shipa
6. **Update Notion HQ** com link a este design doc
7. **Plug ao Wave 33 Block D refresh** se ainda em curso (adicionar mention Sessions Orchestrator no DMs v8/v9)

---

*Design spec composto 2026-06-08 ~05h BRT pós-Wave 33 brief + web research 4 queries (~28 sources). Não confiar nas premissas sem Day 0 recon when Wave 33.5 arranque. Mooter doctrine: ship o local-first cross-session intelligence layer que NINGUÉM ELSE está a shipar 2026.*
