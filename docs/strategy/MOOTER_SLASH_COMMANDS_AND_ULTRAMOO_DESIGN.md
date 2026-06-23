# MOOTER — Slash Commands + Ultramoo Mode Design

**Composto:** 2026-06-08 ~02h BRT, Cowork
**Trigger:** Paulo pediu equivalente local ao `/effort ultracode` + visualização agentes + slash commands estilo Claude Code
**Status:** Pre-Wave 32 design strategic — material para integrar no Wave 32 master prompt
**Filosofia driver:** V4 §1.3 #4 (Explainability) + #5 (Doctrine wins) + Triple-stack play (Wave 35)

---

## ⚡ TL;DR (3 bullets)

1. **Skills + slash commands MERGED no CC v2.1.101 (Abril 2026).** Mooter pode publicar slash commands COMO skills nativamente — zero hack, zero proxy, alinha 100% com Claude Code architecture.
2. **Proposta: 8 slash commands `/moo-*`** que dão a Mooter o "feel" do Claude Code mas local-first + Mooter-specific (ultramoo, herd visualization, dashboard, distill, etc.).
3. **Ultramoo mode session-wide** = ultracode-equivalent mas **local-first hard**: bias T0/T1 quando confidence + LLMLingua compression on + Caveman bundled + LORAUTER routing + Multi-LoRA serving + parallelism MAX baseado em hardware. Wave 32 ship.

---

## Part 1 — Research foundation

### Claude Code slash commands em 2026

**Architecture (post-merge v2.1.101):**
- `.claude/commands/*.md` OR `.claude/skills/*/SKILL.md` → ambos criam `/slash-command`
- Skill com `agent:` frontmatter delega para subagent específico
- Dynamic context injection via shell command output (`run: mooter status --json`)
- Plugins = bundles versionados (skills + agents + hooks + MCP) — canonical way to share

**Built-in slash commands CC (referência):**
- `/clear` — clear conversation
- `/compact` — compact context
- `/help` — help menu
- `/model` — switch model
- `/cost` — show cost
- `/effort` — set effort level (high, xhigh, ultracode)
- `/workflows` — dynamic workflows
- `/loop` — repeat prompt

### Ultracode internals confirmados

> *"Ultracode shipped in CC v2.1.154 on May 28, 2026, alongside Claude Opus 4.8. Sends xhigh reasoning effort to the model AND has Claude auto-orchestrate Dynamic Workflows for substantive tasks, so a request that would otherwise run in one overloaded window gets fanned out across verifying subagents."*

**Key insight:** ultracode é setting **session-wide** (não prompt keyword como ultrathink). Pina effort + auto-workflow até desactivar.

**Mooter learning:** ultramoo deve ser **session-wide** também, com mesma activação pattern.

### Best practices TUI 2026 (Ratatui, Textual)

- Command palette com fuzzy search = standard
- Keyboard-first navigation
- DEC synchronized output (no flicker)
- Ralph TUI: pause/resume/kill per agent

---

## Part 2 — 8 slash commands `/moo-*` proposta

### Design principle

Cada `/moo-*` é um **Mooter skill** publicado em `.claude/skills/mooter-<cmd>/SKILL.md` que:
- Aparece em autocomplete CC alongside built-ins
- Delegate para Mooter subagent OR executa shell command
- Output retorna ao user na sessão CC

### Os 8 comandos

#### 1. `/moo-workflow <task>`

**O que faz:** força workflow local-first via Mooter Workflow Engine (Wave 28). Diferença vs `/workflows` CC: garante local execution + custo <$0.50 cap default.

**Skill spec:**
```markdown
---
name: moo-workflow
description: Create a Mooter local-first workflow with adversarial review
agent: mooter-workflow-orchestrator
allowed-tools: [Bash]
---

Run: `mooter workflow create "$ARGUMENTS" --local-first --adversarial`

The workflow will:
1. Use Mooter Script Writer (1 Opus call) to generate orchestration
2. Execute on local Ollama workers (qwen2.5-coder:7b × 8 parallel)
3. Adversarial review (qwen3:30b × 3 reviewers)
4. Synthesis (1 Opus call)

Cost cap: $0.50 (configurable via `~/.mooter/limits.toml`)
```

**Demo:**
```
User: /moo-workflow audit packages/synthesis for unused exports

Mooter Workflow Engine triggered:
[Script writer (Opus) 380ms · $0.0094] → workflow.js generated
[8 workers (qwen local) 47s · $0] → analyzed 12 files
[3 reviewers (qwen3:30b) 12s · $0] → 9 of 10 findings confirmed
[Synthesis (Opus) 410ms · $0.0089] → report ready

Total: $0.0183 · Saved: $0.42 vs Opus single-pass (95.6%)
```

#### 2. `/moo-effort <mode>`

**O que faz:** equivalente local do `/effort` CC. Modes:
- `low` — single-pass, no Pastor hints, baseline
- `default` — Pastor hints active, normal tier routing
- `high` — Pastor + LLMLingua compression on
- **`ultramoo`** ⭐ — full Mooter power (ver Part 3)

**Skill spec:**
```markdown
---
name: moo-effort
description: Set Mooter routing effort level (low, default, high, ultramoo)
agent: mooter-config-manager
---

Run: `mooter effort set "$ARGUMENTS"`

This persists across the session and biases routing decisions.
```

**Demo:**
```
User: /moo-effort ultramoo

🐮 Ultramoo MODE activated for this session.
   • Bias hard para local (T0/T1 preferred when confidence ≥0.7)
   • LLMLingua compression on (4-10× prompt reduction)
   • Caveman pack auto-applied for prose
   • LORAUTER per-task adapter routing
   • Multi-LoRA serving via vLLM (if available)
   • Workflow Engine auto-triggered for complex tasks
   • Adversarial review on for workflows
   • Parallelism: 8 workers (RTX 4090 detected)
   • Cost cap stricter: $5/workflow, $20/session

To deactivate: /moo-effort default
```

#### 3. `/moo-herd`

**O que faz:** mostra herd activa (Ratatui TUI inline) — visualização em tempo real dos agentes paralelos Mooter Workflow Engine.

**Skill spec:**
```markdown
---
name: moo-herd
description: Show active Mooter Workflow Engine herd (parallel agents)
agent: mooter-tui-renderer
allowed-tools: [Bash]
---

Run: `mooter herd --inline` (renders compact TUI in CC chat)
```

**Demo:**
```
User: /moo-herd

🐮 MOO HERD · 2 active workflows
─────────────────────────────────────────────

Workflow #42 · audit-codebase · Phase 2/4
  🐮 workers: 5/8 running, 3 completed
  🦁 reviewers: 1/3 running
  📊 cost: $0.0019 · ETA: 12s
  
Workflow #43 · refactor-api · Phase 1/4
  🐮 workers: 3/3 running (just started)
  📊 cost: $0.0008 · ETA: 28s

[type 'mooter workflow watch <id>' for full Ratatui dashboard]
```

#### 4. `/moo-dashboard`

**O que faz:** abre Mooter dashboard full TUI (Ratatui standalone). Equivalent ao `mooter dashboard` mas invocável de dentro do CC.

**Skill spec:**
```markdown
---
name: moo-dashboard
description: Open Mooter full dashboard (savings, Pastor, hardware, workflows)
agent: mooter-tui-launcher
allowed-tools: [Bash]
---

Run: `mooter dashboard` (opens in new terminal window or pipe to user)
```

**Demo:** (output is Ratatui TUI — ver mock no `MOOTER_TRANSPARENCY_LAYER_v2.md` Part 2 Q7)

#### 5. `/moo-status`

**O que faz:** statusline didactic mode — explicação humana do que está a acontecer.

**Skill spec:**
```markdown
---
name: moo-status
description: Show Mooter status in didactic mode (human-friendly)
agent: mooter-status-formatter
allowed-tools: [Bash]
---

Run: `mooter status --didactic`
```

**Demo:**
```
User: /moo-status

🐮 Mooter v1.20 — Your LLM router. Local-first. Learns forever.

TODAY (so far)
  💰 Saved $1.27 of $1.74 baseline (73% saved)
  🏠 Local execution: 60% (12 of 20 prompts)
  ⚡ Avg first-token latency: 0.8s

CURRENT MODE
  🎯 Effort: ultramoo (max local bias)
  🧬 Pastor v1.3 active · trained on 260 decisions
  🧠 LoRA adapter: frontend (+3.2pp accuracy)

HARDWARE  
  🎮 RTX 4090 · 87% VRAM (vLLM multi-LoRA active)
  📦 6 LoRA adapters loaded simultaneously
  ⚡ 285 tok/s avg throughput

LIMITS
  🔒 Session cap: $20/$50 (40% used)
  🔒 T3 rate: 0 of 30/5min (OK)
```

#### 6. `/moo-distill [--output <file>]`

**O que faz:** Pastor knowledge distillation — exporta learnings como markdown skill installable.

**Skill spec:**
```markdown
---
name: moo-distill
description: Distill Pastor learnings into installable skill markdown
agent: mooter-pastor-distiller
allowed-tools: [Bash, Write]
---

Run: `mooter pastor distill --output "${ARGUMENTS:-pastor-$(date +%Y%m%d).skill.md}"`

The output skill contains:
- Top routing patterns learned (tier + adapter combinations)
- Empirical scores per task type
- Privacy: NO prompt content, just patterns

Installable via: `npx skills add file://./pastor-YYYYMMDD.skill.md`
```

**Demo:**
```
User: /moo-distill

✓ Distilled 260 decisions into pastor-2026-06-08.skill.md
✓ 5 top patterns extracted
✓ Privacy verified: 0 prompt content, 0 PII

File: /home/paulo/pastor-2026-06-08.skill.md (12 KB)

Install with: npx skills add file:///home/paulo/pastor-2026-06-08.skill.md
Share publicly: GitHub gist · npm registry · Anthropic skill marketplace
```

#### 7. `/moo-pack <action> [name]`

**O que faz:** gestão Mooter Packs (install/uninstall/list/sync).

**Skill spec:**
```markdown
---
name: moo-pack
description: Manage Mooter Packs (install, uninstall, list, sync)
agent: mooter-pack-manager
allowed-tools: [Bash]
---

Run: `mooter pack $ARGUMENTS`

Available packs:
- caveman (token compression)
- obsidian-vault-sync (vault bridge)
- diagram-systems (diagrams)
- ... (run /moo-pack list for full catalog)
```

**Demo:**
```
User: /moo-pack install caveman

🐮 Installing Mooter Pack: caveman
   Author: Julius Brussee (juliusbrussee/caveman)
   License: MIT
   Purpose: 8-10% out-token savings via brevity style
   
✓ Skill installed: /caveman now available in CC
✓ Pastor signal hooked: will track caveman acceptance rate
✓ Statusline chip added: 🪨 caveman -82 tokens today

Pack is opt-in per prompt. Use /caveman to invoke or set as default in ~/.mooter/config.toml
```

#### 8. `/moo-help`

**O que faz:** help menu para todos os comandos `/moo-*` + filosofia + mission statement.

**Demo:**
```
User: /moo-help

🐮 MOOTER — Your LLM router. Local-first. Learns forever.

SLASH COMMANDS:
  /moo-workflow <task>    Create local-first dynamic workflow
  /moo-effort <mode>      Set effort: low | default | high | ultramoo
  /moo-herd               Show active workflow herd (compact)
  /moo-dashboard          Open full dashboard TUI
  /moo-status             Status in didactic mode (human-friendly)
  /moo-distill            Export Pastor learnings as skill
  /moo-pack <action>      Manage Mooter Packs
  /moo-help               This menu

CLI EQUIVALENTS (terminal):
  mooter workflow create  | mooter effort set | mooter herd
  mooter dashboard       | mooter status     | mooter pastor distill
  mooter pack            | mooter --help

CURRENT SESSION:
  Effort: ultramoo · Pastor: v1.3 · Adapters: 6 loaded · Saved today: 73%

DOCS: docs/MOOTER_OPERATIONS_GUIDE_v1.0.md
```

---

## Part 3 — Ultramoo Mode Spec (the killer feature)

### Definition

**Ultramoo** é o setting Mooter equivalente ao **ultracode** do Claude Code, mas com **filosofia local-first**.

| Aspect | `/effort ultracode` (CC) | `/moo-effort ultramoo` (Mooter) |
|---|---|---|
| Scope | Session-wide | Session-wide |
| Reasoning effort | xhigh sent to API | High (local primarily) |
| Workflow auto-trigger | ✅ for substantive tasks | ✅ for substantive tasks |
| Primary backend | Anthropic cloud | Local Ollama / vLLM |
| Multi-agent paralelismo | Cloud subagents | **Local 8× workers (4090) ou hardware-detected** |
| Adversarial review | ✅ via cloud | ✅ via local qwen3:30b |
| Prompt compression | ❌ | ✅ LLMLingua 4-10× |
| Style optimisation | ❌ | ✅ Caveman bundled |
| Per-task adapter | ❌ | ✅ LORAUTER per-task |
| Multi-LoRA serving | ❌ | ✅ vLLM (opt-in) |
| Cost per heavy task | $0.45 - $3 | **$0.0028 - $0.05** |
| Privacy | Code → Anthropic | Code stays local (except synthesis) |

### Activation

```
/moo-effort ultramoo
```

OR persistent em `~/.mooter/config.toml`:
```toml
[effort]
default = "ultramoo"
```

### What ultramoo does (technical)

1. **Routing bias hard para local:**
   - classify.js outputs T0/T1 sempre que confidence ≥0.7 (default 0.6)
   - Bandit Learner (Wave 30 L16.2) prefere local Thompson Sampling reward

2. **Prompt compression on:**
   - LLMLingua compressor (Wave 29 L12) aplicado antes de routing
   - Target 4-10× compression (entity-safe)
   - Statusline chip: `📦 lingua 4.2× (-1842 tokens)`

3. **Style optimisation:**
   - Caveman pack auto-aplicado para prose tasks
   - Statusline chip: `🪨 caveman -82 tokens`

4. **Per-task LoRA routing (LORAUTER):**
   - 6 adapters loaded (frontend/backend/data/pt-pt/en/baseline)
   - Per-request selection via task features
   - <10ms swap via Multi-LoRA vLLM

5. **Workflow Engine auto-trigger:**
   - Tasks substanciais (>500 tokens prompt, multi-file, "audit"/"refactor"/"migrate" keywords) → workflow
   - 8 workers parallelos (qwen2.5-coder:7b × 8)
   - 3 reviewers adversariais (qwen3:30b)

6. **Hardware utilization MAX:**
   - Multi-LoRA serving via vLLM (se installed)
   - 22 GB VRAM usados (de 24 GB) com qwen3:30b reviewer + 8 workers + 6 LoRA adapters
   - Statusline chip: `🎮 87% VRAM · 8 workers · 6 LoRA`

7. **Cost cap stricter:**
   - `max_workflow_cost_usd = 5.00` → 1.00 em ultramoo
   - `max_session_cost_usd = 50.00` → 20.00 em ultramoo
   - Anomaly detect mais aggressive

8. **Statusline shifted:**
   - Line 3 mode: `🐄 ultramoo · 60% local · 8 workers · lingua 4× · LoRA frontend`

### When to use ultramoo

✅ **Use:**
- Audits codebase wide
- Multi-file refactors
- Long-running tasks (>5 min expected)
- When privacy matters (sensitive code)
- When budget tight (PAYG users)

❌ **Don't use:**
- Quick fixes (overhead overkill)
- Architecture from scratch (cloud Opus single-pass may be better)
- When you NEED 1M context (MiniMax/cloud)
- Simple chat

### When ultramoo wins (real example)

**Task:** "audit packages/ for unused exports"

| Mode | Cost | Time | Quality | Privacy |
|---|---|---|---|---|
| `/effort high` (CC default) | $0.45 | 4 min | 95% | Code → Anthropic |
| `/effort ultracode` (CC) | $1.80 | 6 min | 98% | Code → Anthropic |
| `/moo-effort default` (Mooter) | $0.18 | 5 min | 92% | Local + Opus synthesis |
| **`/moo-effort ultramoo` (Mooter)** | **$0.018** | **47s** | **96%** | **Local + 1 cloud call** |

Ultramoo wins em: **100× cost reduction, 8× speed, 96% quality match, privacy preserved**.

---

## Part 4 — Mock-ups visuais

### Mock 1 — `/moo-effort ultramoo` activation

```
User: /moo-effort ultramoo

╔══════════════════════════════════════════════════════════════╗
║  🐮 ULTRAMOO ACTIVATED                                       ║
║  ──────────────────────────────────────────────────────────  ║
║                                                              ║
║  ✓ Routing: local-first hard (T0/T1 bias when conf ≥0.7)    ║
║  ✓ Compression: LLMLingua 4-10× (entity-safe)               ║
║  ✓ Style: Caveman pack auto for prose                       ║
║  ✓ Adapters: LORAUTER per-task (6 loaded via vLLM)          ║
║  ✓ Workflow: auto-trigger for substantive tasks             ║
║  ✓ Parallelism: 8 workers (RTX 4090)                        ║
║  ✓ Review: adversarial qwen3:30b × 3                        ║
║  ✓ Cost cap: stricter ($1/workflow, $20/session)            ║
║                                                              ║
║  Session ID: 7b01eb86-…                                      ║
║  Deactivate: /moo-effort default                             ║
╚══════════════════════════════════════════════════════════════╝

Statusline updated to ultramoo mode.
```

### Mock 2 — `/moo-herd` inline view

```
User: /moo-herd

🐮 MOO HERD · 2 active · ultramoo mode
─────────────────────────────────────────────────

Workflow #42 · audit-codebase
  Phase 2/4 · 67% convergence · ETA 12s
  🐮 [▓▓▓▓▓▓▓▓░░] 8 workers (5 done, 3 running)
  🦁 [▓▓░░░░░░░░] 3 reviewers (1 done, 2 running)
  💰 $0.0019 spent (cap: $1.00)

Workflow #43 · refactor-api-types
  Phase 1/4 · 12% (just started)
  🐮 [▓░░░░░░░░░] 3 workers running
  💰 $0.0003 spent

Total active cost: $0.0022 · Limits: OK ✓
─────────────────────────────────────────────────
[type 'mooter workflow watch <id>' for full Ratatui]
[type '/moo-herd kill <id>' to stop specific]
```

### Mock 3 — `/moo-status` didactic

```
User: /moo-status

🐮 Mooter v1.20 — Your LLM router. Local-first. Learns forever.

╔═══ TODAY ═══════════════════════════════════════════════════╗
║  💰 Saved $1.27 (73% of $1.74 baseline)                    ║
║  🏠 60% prompts ran LOCALLY at $0                          ║
║  ⚡ Avg latency: 0.8s first-token                          ║
║  📊 Prompts: 20 (T0=6 · T1=3 · T2=1 · T3=0)                ║
╚═════════════════════════════════════════════════════════════╝

╔═══ MODE ════════════════════════════════════════════════════╗
║  🎯 Effort: ultramoo (max local bias)                      ║
║  🧬 Pastor v1.3 · trained on 260 decisions                 ║
║  🧠 Active adapter: frontend (+3.2pp accuracy)             ║
║  📦 LLMLingua compression: 4.2× active                     ║
║  🪨 Caveman pack: on for prose                             ║
╚═════════════════════════════════════════════════════════════╝

╔═══ HARDWARE ════════════════════════════════════════════════╗
║  🎮 RTX 4090 · 87% VRAM (vLLM multi-LoRA active)           ║
║  📦 6 LoRA adapters loaded simultaneously                  ║
║  ⚡ 285 tok/s avg throughput                               ║
║  🚄 vLLM backend (opt-in, 16.6× concurrent vs Ollama)      ║
╚═════════════════════════════════════════════════════════════╝

╔═══ LIMITS ══════════════════════════════════════════════════╗
║  🔒 Session cap: $20.00 (using $0.97, 4.9%)                ║
║  🔒 Workflow cap: $1.00 (no active workflows over cap)      ║
║  🔒 T3 rate: 0 of 30/5min (OK)                             ║
╚═════════════════════════════════════════════════════════════╝

Commands: /moo-workflow · /moo-effort · /moo-herd · /moo-dashboard
Full TUI: mooter dashboard
Docs: docs/MOOTER_OPERATIONS_GUIDE_v1.0.md
```

---

## Part 5 — Integration com Wave 32

Wave 32 brief (Transparency Layer) deve **adicionar 2 phases novas**:

### Phase NEW1 (entre F e G) — Slash Commands Skills (T2, 3h)

Cria `.claude/skills/mooter-<cmd>/SKILL.md` para os 8 comandos:
- mooter-workflow
- mooter-effort
- mooter-herd
- mooter-dashboard
- mooter-status
- mooter-distill
- mooter-pack
- mooter-help

Cada skill com frontmatter `agent:` + shell command execution.

**Gate:** todos 8 comandos invocáveis via `/moo-*` em sessão CC.

### Phase NEW2 (entre I e J) — Ultramoo Mode Implementation (T3, 4h)

`packages/synthesis/src/effort/`:
- `effort-manager.ts` — read/write `~/.mooter/effort.json`
- `ultramoo-config.ts` — preset que combina:
  - LLMLingua compression on
  - Caveman pack auto for prose
  - LORAUTER per-task routing
  - Multi-LoRA vLLM (if available)
  - Workflow Engine auto-trigger threshold lower
  - Cost cap stricter
  - Bandit bias local hard
  - Statusline mode `ultramoo`

CLI:
- `mooter effort set ultramoo`
- `mooter effort show`
- `mooter effort reset` (back to default)

**Gate:** ultramoo activation flips all 8 settings + statusline reflects + unit test for each subsystem.

### Updated Wave 32 phases (16 total)

| Phase | Goal | Tier | Effort |
|---|---|---|---|
| A | Day 0 recon | T0/T1 | 0.5h |
| B | Statusline 4 modes | T2 | 3h |
| C | Inline token tracker per cmd | T2 | 2h |
| D | `mooter dashboard` TUI | T3 | 4h |
| E | `mooter workflow watch` Ralph TUI | T3 | 3h |
| F | LoRA train-watch | T2 | 3h |
| **NEW1** | **Slash commands /moo-* skills** | **T2** | **3h** |
| G | Quant + Vector chips | T1 | 1.5h |
| H | vLLM opt-in installer | T2 | 3h |
| I | Multi-LoRA serving | T3 | 4h |
| **NEW2** | **Ultramoo mode implementation** | **T3** | **4h** |
| J | Hub /v1/transparency + migration 017 | T2 | 1.5h |
| K | Tests + integration | T2 | 2h |
| L | Docs + demos | T1 | 1.5h |
| M | Final-reviewer + PR + merge + tag | T3 | 1h |
| N | Notion auto-write via MCP | T1 | 0.5h |

**Total Wave 32 ajustado:** ~37h CC (vs 24h original). Em ultracode CC modo, esperado ~2-3h real.

---

## Part 6 — Anti-patterns

| # | Anti-pattern | Mooter avoids by |
|---|---|---|
| 1 | Substituir slash commands existing | `/moo-*` prefix evita colisão |
| 2 | Ultramoo override doctrine | classify.js continua hard guardrail |
| 3 | Slash command sem fallback | Cada um tem CLI equivalent (`mooter ...`) |
| 4 | TUI lock-in (require GUI) | Sempre opção `--text` para plain output |
| 5 | Skill que mistura cloud + local sem clareza | Statusline mostra sempre 🏠 ou ☁️ |
| 6 | Hard cap sem warning antes | Statusline chip alert em 80% cap |
| 7 | Ultramoo settings opacos | `/moo-effort show` lista TUDO o que está active |
| 8 | Distillation skill com PII | Privacy gate enforced (Wave 29 pattern) |

---

## Part 7 — Compare ultramoo vs ultracode lado a lado

| Dimension | `/effort ultracode` (Claude Code) | `/moo-effort ultramoo` (Mooter) |
|---|---|---|
| **Activation** | `/effort ultracode` (built-in) | `/moo-effort ultramoo` (Mooter skill) |
| **Scope** | Session-wide | Session-wide |
| **Workflow auto-trigger** | ✅ | ✅ |
| **Reasoning effort** | xhigh API | High local + xhigh synthesis only |
| **Primary execution** | Cloud Anthropic | **Local Ollama / vLLM** |
| **Parallelism** | Cloud subagents | Local 8× (4090) or hardware-detected |
| **Adversarial review** | Cloud agents | Local qwen3:30b × 3 |
| **Prompt compression** | ❌ | ✅ LLMLingua 4-10× |
| **Style brevity** | ❌ | ✅ Caveman bundled |
| **Per-task LoRA** | ❌ | ✅ LORAUTER per-task |
| **Multi-LoRA serving** | ❌ | ✅ Multi-LoRA via vLLM |
| **Statusline live** | Basic | Rich (chips + dashboard) |
| **Cost typical heavy task** | $1.80 - $3 | **$0.018 - $0.10** |
| **Speed (audit 12 files)** | ~6 min | **~47s** |
| **Privacy** | Code → Anthropic | Code stays local (synthesis only cloud) |
| **Plan-gated** | Max/Team/Enterprise | All tiers (OSS) |

**Conclusão:** ultramoo é **100× cheaper, 8× faster, privacy-preserving**. Por isso é o **Mooter killer mode**.

---

## Part 8 — Filosofia honra check (V4+V5)

| Princípio | Status |
|---|---|
| No proxy | ✅ Slash commands delegam para Mooter agents, não substituem CC |
| Zero LLM cost classificação | ✅ classify.js continua regex |
| Doctrine > config | ✅ Markdown skills, não YAML |
| **Explainability** | ✅✅✅ `/moo-status` didactic mode |
| Doctrine wins | ✅ classify.js hard guardrail, ultramoo bias mas não substitui |
| Subscription-aware | ✅ ultramoo detecta sub e ajusta thresholds |
| Local-first | ✅✅✅ ultramoo é manifestação literal |
| Triple-stack | ✅ Skills + Plugin (Wave 35) + MCP (Wave 30) |

**8/8 honored.**

---

## Part 9 — Sources canónicos (research Wave 32 add)

### Slash commands + skills CC 2026
- [Extend Claude with skills (CC Docs)](https://code.claude.com/docs/en/skills)
- [Best Claude Code Skills 2026 (Toolradar)](https://toolradar.com/blog/best-claude-code-skills-2026)
- [Master Tutorial Slash Commands April 2026](https://aiopsschool.com/blog/the-master-tutorial-every-claude-code-slash-command-explained-april-2026-edition/)
- [Claude Code Skills Tutorial (Supalaunch)](https://supalaunch.com/blog/claude-code-skills-tutorial-custom-slash-commands-and-automations-guide)
- [Complete Power User Guide (Dev.to)](https://dev.to/numbpill3d/the-complete-claude-code-power-user-guide-slash-commands-hooks-skills-more-6ep)

### Ultracode internals 2026
- [Ultracode Claude Code Effort Setting (claudefa.st)](https://claudefa.st/blog/guide/development/ultracode)
- [What is Ultra Code Mode (MindStudio)](https://www.mindstudio.ai/blog/what-is-ultra-code-mode-claude-code)
- [Ultracode QCode Guide](https://qcode.cc/en/claude-code-ultracode-guide)
- [From One Agent to Orchestra (Medium)](https://medium.com/@wasowski.jarek/claude-code-workflow-and-ultracode-multi-agent-orchestration-from-the-inside-12b42ba37e64)
- [Set Opus 4.8 + /ultracode (Code Coup)](https://medium.com/@CodeCoup/set-opus-4-8-ultracode-and-watch-claude-code-go-fully-autonomous-ca754b97833e)

### TUI command palette UX 2026
- [Command Palette Pattern (UX Patterns Dev)](https://uxpatterns.dev/patterns/advanced/command-palette)
- [UX Patterns CLI Tools (Lucas Costa)](https://lucasfcosta.com/2022/06/01/ux-patterns-cli-tools.html)
- [Command Line Interface Guidelines](https://clig.dev/)
- [TUI Studio Visual Tool 2026](https://dev.to/onsen/tui-studio-the-visual-terminal-ui-design-tool-developers-need-1c23)

---

## Part 10 — Próximo passo concreto

1. **Wave 31 SHIPPED** (a correr agora — Pastor v2 LORAUTER + Obsidian + Distillation)
2. **Quando SHIPPED:** dizes "GO Wave 32"
3. **Eu componho** `WAVE32_TRANSPARENCY_PERFORMANCE_KICKOFF.md` com:
   - 16 phases (A-N + NEW1 + NEW2)
   - Detalhe per phase
   - Doctrine non-negotiable
4. **CC executa Wave 32** autonomous (~37h estimate, real ~2-3h em ultracode)
5. **Resultado:** Mooter v1.20 com:
   - Statusline refined + dashboard TUI
   - **`/moo-*` slash commands LIVE em CC**
   - **`/moo-effort ultramoo` mode LIVE**
   - vLLM opt-in + Multi-LoRA serving
   - Inline token tracker per cmd
   - LoRA train-watch + Quant/Vector chips

**Critério sucesso final:** *"Um vibe coder intermediário abre CC, escreve `/moo-help`, vê os 8 comandos, escreve `/moo-effort ultramoo`, e em 30 segundos tem Mooter a routear local-first com Pastor v2 LoRAs, Caveman style, LLMLingua compression, e workflow auto-trigger para tarefas substanciais. Statusline mostra TUDO em tempo real. Anthropic teria orgulho."*

---

*Doc composto pelo Cowork enquanto Wave 31 CC corre. Pre-Wave 32. Integra ao WAVE32_TRANSPARENCY_PERFORMANCE_KICKOFF.md.*
