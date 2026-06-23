# MOOTER — Transparency Layer v2 (research-backed)

**Composto:** 2026-06-08 ~01h BRT, Cowork
**Trigger:** Paulo identificou 7 gaps de UX/observability + pediu deep dive research
**Status doc:** Pre-Wave 32 strategic — define o que faz Mooter "incrível para qualquer um entender"
**Filosofia driver:** V4 §1.3 princípio #4 — **Explainability** (cada decisão tem reasoning, user sabe sempre o "porquê")

---

## ⚡ TL;DR (4 bullets, ler primeiro)

1. **Os 7 pontos do Paulo são manifestação directa do princípio Explainability V4.** Sem isto, Mooter é "magic box" como Cursor. Com isto, Mooter é o **primeiro router OSS transparente em tempo real**.
2. **Killer discovery na research:** vLLM tem **16.6× throughput vs Ollama** em concurrent. Mooter pode oferecer **opt-in vLLM serving backend** para workflows pesados. **PagedAttention + Multi-LoRA = perfect fit para Pastor v2 LORAUTER (Wave 31)**.
3. **Wave 32 proposta:** **Transparency + Performance Layer mega** (~24h CC autonomous, modo ultracode). Cobre os 7 pontos + integra vLLM + TurboQuant prep + Multi-LoRA serving. Tag `v1.20.0-transparency-performance`.
4. **Filosofia honrada:** Starship (Rust ≤10ms), Ralph TUI (Mission Control), Ratatui (declarative TUI), CShip pattern (Claude Code-specific statusline) — todos integrados sem violar V4 doctrine (no proxy, doctrine wins, classify.js sha intacto).

---

## Part 1 — Filosofia Mooter aplicada (Explainability driver)

V4 §1.3 princípio #4: *"Explainability — cada decisão tem campo `reasoning`. O user sabe sempre 'porquê Opus?'"*

Os 7 pontos do Paulo descodificam este princípio em 7 dimensões observáveis:

| # | Pergunta Paulo | Princípio V4 honrado | Anti-thesis (o que Cursor faz) |
|---|---|---|---|
| Q1 | Indicador evolução LoRA | Explainability + Continuous learning | "Trust us, model improves" (zero visibility) |
| Q2 | Quant/Vector observability | Explainability técnica | Hidden infra |
| Q3 | Statusline refinement | Real-time transparency | Splash screen + opaque progress bars |
| Q4 | Workflow visualization | Multi-agent visibility | "Black box agent" |
| Q5 | Hardware utilization | Honest resource accounting | "Subscription per seat, capacity hidden" |
| Q6 | Per-prompt token tracker | Decision-level transparency | Monthly invoice surprises |
| Q7 | Didactic mode | Newbie-friendly explainability | "Read docs to understand" |

**Conclusão:** os 7 pontos são literalmente o "Layer 12 do produto" — a interface entre os 16 layers técnicos e a percepção humana.

---

## Part 2 — Deep dive per pergunta (com research backing)

### Q1 — Indicador evolução LoRA

#### Research (2026)

| Tool | Pattern | Aplicabilidade Mooter |
|---|---|---|
| **TensorBoard** | Loss curve + epoch tracking | Local visualization (não cloud-dep) — fit perfeito |
| **W&B (Weights & Biases)** | Cloud dashboard + alerts | Optional opt-in upload (privacy first) |
| **Unsloth/Axolotl** | `--report-to wandb/tb` flag | Mooter implementa próprio TB-style local |
| **HuggingFace** | TensorBoard embedded per model | Pattern para Mooter Pastor dashboard |

> *"Monitoring training loss and validation loss via WandB or TensorBoard is essential for detecting overfitting early. Observability in ML training isn't just nice-to-have, it's essential."* — research 2026

#### Solução Mooter

**`mooter pastor train-watch` — local TensorBoard-like via Ratatui TUI:**

```
╔═══════════════════════════════════════════════════╗
║  Pastor v1.3 Training · Epoch 3/10 · 1h22m left   ║
╠═══════════════════════════════════════════════════╣
║                                                   ║
║  Loss curve (training)                            ║
║  0.8 ●                                            ║
║      ●                                            ║
║  0.6   ●●                                         ║
║          ●●●                                      ║
║  0.4        ●●●●                                  ║
║                 ●●●●●●●                           ║
║  0.2                   ●●●●●●●● ← current 0.28   ║
║                                                   ║
║  Validation loss: 0.31 (▲ +0.03 last epoch)      ║
║  Adapter delta vs baseline: +3.2pp accuracy       ║
║                                                   ║
║  Per-task scores:                                 ║
║   coding-frontend:  85% (▲ +6pp)                 ║
║   coding-backend:   78% (▲ +2pp)                 ║
║   prose-pt-pt:      92% (▲ +12pp) ← biggest win  ║
║                                                   ║
║  Samples processed: 4,032 of 12,500              ║
║  GPU 4090: 87% util · 18.2 GB VRAM               ║
╚═══════════════════════════════════════════════════╝
```

**Statusline chip (always visible quando training):**
```
🧬 Pastor training · epoch 3/10 · loss 0.28 ↓ · ETA 1h22m
```

**Statusline chip pós-training:**
```
🧬 Pastor v1.3 · +3.2pp accuracy · 67% adoption · 260 samples
```

#### Anti-pattern evitar
❌ Não pegar dependência W&B (cloud lock-in). TB-like local é OSS-pure.
❌ Não mostrar metric solta sem comparison vs baseline (não significa nada).

---

### Q2 — Indicador quantização + vetorização

#### Research (2026)

| Métrica | Standard 2026 |
|---|---|
| Quantization bits | `Q4_K_M` (4-bit), `Q5_K_M`, `FP16`, `Q3_TurboQuant` (futuro) |
| KV cache compression | TurboQuant 6× target, baseline 1× |
| Throughput tok/s | Per model per quantization |
| Embedding model | `nomic-embed`, `all-MiniLM-L6-v2`, `bge-large-en` |
| Vector dimensions | 384, 768, 1024 typical |
| Retrieval metric | Recall@k, MRR, NDCG |

#### Solução Mooter

**Statusline chips (opt-in linha 3):**

```
📦 qwen2.5-coder:7b · Q4_K_M · 4.5 GB · 78 tok/s
🎯 KV cache: 1× (TurboQuant 6× available Wave 32)
🧭 nomic-embed-text · 768d · 1.2k vectors cached
```

**`mooter quant status` cmd:**
```
Loaded models:
─────────────────────────────────────────────
qwen2.5-coder:7b   Q4_K_M   4.5 GB   78 tok/s   ▓▓▓▓░░░░░░ 38%
qwen3:30b          Q4_K_M  17.2 GB   23 tok/s   ▓▓▓▓▓▓▓▓░░ 72%

KV cache strategy: baseline (1×)
Available upgrade: TurboQuant Q3 (6× compression, 3-bit)
  → would free ~14 GB VRAM
  → would enable 24 concurrent workers

Embeddings:
  nomic-embed-text · 768d · 1,247 vectors · recall@5 87%
```

**Quando TurboQuant entrar (Wave 32):**
```
📦 qwen3:30b · Q3_TurboQuant · 2.8 GB (6× ↓) · 285 tok/s · 24 workers
```

---

### Q3 — Statusline refinamento 🔥

#### Research (2026)

**Standard dominante: Starship (Rust)**
- ≤10ms render budget
- Universal (works across shells)
- Modular preset system (Catppuccin, Pastel Powerline, Tokyo Night, etc.)
- Left-to-right narrative: left=context, right=status

**CShip (Claude Code specific):**
- > "A beautiful, fully customizable statusline for Claude Code — Starship-style TOML config, themeable colours, Nerd Font glyphs, and tunable cost/context/usage thresholds."
- Written in Rust, ≤10ms render budget

**Design principle:**
> *"Your terminal prompt should reflect how you work and what information you need at a glance, paying attention to which information you actually use and which just becomes noise."*

#### Solução Mooter

**Refined 3-line statusline (default `compact`):**

```
Line 1: 🐮 Mooter v1.19 · 73% saved today ($1.27) · 60% local
Line 2: 📊 last 10: T0=6 T1=3 T2=1 T3=0 · this turn: T3 Opus (0.90 conf)
Line 3: 🧬 Pastor v1.2 · 🧠 frontend adapter · ⚡ 23 tok/s · 🔒 limits OK
```

**4 modes via `mooter statusline mode <name>`:**

| Mode | Lines | Use case |
|---|---|---|
| `mini` | 1 | Maximum focus, just savings |
| `compact` | 2 (Lines 1-2) | Default — most users |
| `full` | 3 | Power users + advanced |
| `didactic` | 5 | Newbies, learning Mooter |

**`didactic` mode (Q7 answer):**
```
Line 1: 🐮 Mooter is YOUR LLM router — saving 73% ($1.27 today)
Line 2: 📊 60% of your prompts ran LOCALLY (T0) at $0 cost
Line 3: ☁️  This turn used Opus (most powerful) for high-confidence task
Line 4: 🧬 Pastor is learning your patterns (260 decisions trained)
Line 5: 🔒 All within your $50 daily budget (currently $1.27)
```

**Anti-pattern evitar:**
❌ Não copiar esoteric symbols sem explanation (`T3:273.6k` sem context).
❌ Não esquecer render budget (≤10ms para não ser laggy).
❌ Não fazer monochrome (cores hierarchizam info).

---

### Q4 — Dynamic Workflow Moo visualization 🐮

#### Research (2026)

**Ralph TUI** (Verdent guide):
> *"Ralph TUI is a Mission Control dashboard designed to bring visibility, control, and recovery back into autonomous agent workflows. It visualizes task execution, allowing you to see exactly which step the agent is on. You can pause, resume, or kill a specific task without nuking the whole session."*

**Gastown Viewer Intent dashboard:**
> *"Monitor and manage multi-agent workflows with real-time tracking and interactive visualizations."*

**Ratatui framework (Rust):**
- Declarative paradigm + v2 rewrite
- Split panes, keyboard navigation
- DEC synchronized output protocol (no flickering)
- Charm BubbleTea v2, Ink v6.7+ similar patterns

#### Solução Mooter

**`mooter workflow watch <id>` — Ratatui Mission Control:**

```
╔════════════════════════════════════════════════════════════╗
║  🐮 MOO HERD · Workflow audit-codebase · Run #42           ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ║
║  Phase 2/4 · Convergence 67% · Cost so far: $0.0019        ║
║                                                            ║
║  ┌─ WORKERS (qwen2.5-coder:7b × 8 parallel) ─────────┐    ║
║  │ 🐮 #1 src/api.ts        ✅ 12.3s · 1,247 tokens    │    ║
║  │ 🐮 #2 src/db.ts         ✅  9.8s · 980 tokens      │    ║
║  │ 🐮 #3 src/cache.ts      🔄 11.4s · 670 tokens      │    ║
║  │ 🐮 #4 src/auth.ts       🔄 13.7s · 1,021 tokens    │    ║
║  │ 🐮 #5 src/router.ts     🔄 10.2s · 856 tokens      │    ║
║  │ 🐮 #6 src/utils.ts      ✅  7.9s · 543 tokens      │    ║
║  │ 🐮 #7 src/types.ts      ✅  6.5s · 421 tokens      │    ║
║  │ 🐮 #8 src/index.ts      🔄 14.1s · 1,134 tokens    │    ║
║  └────────────────────────────────────────────────────┘    ║
║                                                            ║
║  ┌─ REVIEWERS (qwen3:30b × 3 adversarial) ────────────┐    ║
║  │ 🦁 #1 finding-1  ✅ 4.2s · confirmed (conf 0.91)   │    ║
║  │ 🦁 #2 finding-2  ❌ 3.8s · rejected (false-pos)    │    ║
║  │ 🦁 #3 finding-3  🔄 5.1s · checking sources        │    ║
║  └────────────────────────────────────────────────────┘    ║
║                                                            ║
║  ┌─ METRICS ──────────────────────────────────────────┐    ║
║  │ ETA: 18s · GPU: 87% util · VRAM: 22.3/24 GB        │    ║
║  │ Saved vs all-Opus: $0.43 (95.5%) · MLWR: 92%       │    ║
║  └────────────────────────────────────────────────────┘    ║
║                                                            ║
║  [p] pause · [r] resume · [k] kill agent · [q] quit       ║
╚════════════════════════════════════════════════════════════╝
```

**Features (Ralph TUI inspired):**
- Pause/resume per agent
- Kill specific agent without nuking session
- Real-time token/cost tracking
- Convergence percentage live
- ETA based on completed work

**Statusline chip durante workflow:**
```
🐄 herd · 8 workers · 67% convergence · ETA 18s
```

---

### Q5 — Multi-model concurrent ⭐ KILLER DISCOVERY

#### Research bomba 2026

**vLLM vs Ollama benchmark (Spheron, Particula, Markaicode 2026):**

| Métrica | Ollama | vLLM |
|---|---|---|
| Concurrent requests | Sequential queue | Continuous batching |
| 8+ concurrent | Throughput plateau | Scales proportionally |
| 20 users | Queue 19 of 20 | Processes all 20 same batch |
| 128 users | **Collapses** | 100% success rate |
| Llama 3.1 70B Blackwell | 484 tok/s | **8,033 tok/s (16.6×)** |
| Multi-model VRAM density | 1× baseline | **2-3× higher** (PagedAttention) |
| Multi-LoRA serving | ❌ no native | ✅ **multi-LoRA single base** |

**vLLM Multi-LoRA pattern:** *"Multi-LoRA is the most efficient way to serve multiple fine-tuned versions of the same base model, reducing memory overhead per model to megabytes."*

#### **Honest:** Mooter Workflow Engine actual usa Ollama. Para Wave 31 (LORAUTER) + Wave 32 (concurrent workloads) PRECISAMOS de considerar vLLM como opcional.

#### Solução Mooter — vLLM opt-in backend

**3 modes serving:**

| Backend | Use case | Setup |
|---|---|---|
| **Ollama (default)** | Simple, low concurrency, easy setup | Built-in |
| **vLLM (opt-in)** | High concurrency workflows, multi-LoRA Pastor | `mooter backend install vllm` |
| **Mixed** | Workflows usam vLLM, simple prompts usam Ollama | Auto-detect baseado em workload |

**Killer use case Pastor v2 LORAUTER (Wave 31 fundação):**

```
Hoje (Ollama):
- LoRA Pastor v1.gguf merged into qwen2.5-coder:7b base
- Único adapter activo per time
- Swap adapter = reload model (~30s)

Com vLLM + Multi-LoRA:
- qwen2.5-coder:7b base loaded ONCE
- 6 LoRA adapters loaded simultaneously (frontend/backend/data/pt-pt/en/baseline)
- Per-request adapter selection (LORAUTER routing) em runtime
- Latency switch: <10ms (vs 30s Ollama reload)
- VRAM overhead: ~50 MB per adapter (vs full model reload)
```

**Statusline chip:**
```
🚄 vLLM backend · 6 LoRA adapters loaded · 285 tok/s · 24 concurrent slots
```

**Honest constraint:** vLLM requires NVIDIA GPU (Linux/WSL2 ok). Paulo tem 4090 ✅. Mas users Mac M-series não terão. Por isso é **opt-in**, default Ollama.

---

### Q6 — Token tracker per prompt/bash (igual CC)

#### Research

**CC pattern (Claude Code):**
- Pre-output token estimate
- Post-output actual count
- Cost displayed inline

**Wave 30 Mooter já tem:** statusline acumulado, mas **não per-command**.

#### Solução Mooter

**Inline prefix pattern:**

```
$ mooter workflow create "audit src/ for unused exports"
[T2 ☁️  Opus 380ms · 1,247 tok · $0.0094] orchestration script ready
[T0 🏠 qwen2.5-coder × 8 parallel 12s · 4,231 tok · $0] workers analyzed
[T0 🏠 qwen3:30b × 3 reviewer 8s · 1,892 tok · $0] reviewers verified
[T3 ☁️  Opus 410ms · 856 tok · $0.0089] synthesis final
────────────────────────────────────────────────────
Total: $0.0183 (saved $0.4217 vs all-Opus = 96%)
Workflow: audit-unused-exports · Run #42 · Cost cap OK (5% used)
```

**Color coding (terminal supports):**
- 🟢 Green: T0 local (free)
- 🟡 Yellow: T1 cloud Haiku (cheap)
- 🟠 Orange: T2 cloud Sonnet (medium)
- 🔴 Red: T3 cloud Opus (expensive)

**Bash command tracker:**
```
$ mooter chat "fix the bug in src/api.ts"
[classify.js 47ms · T2 (conf 0.89) · reason: "code-fix-medium-complexity"]
[T0 🏠 qwen2.5-coder 2.3s · 856 tok · $0] suggested fix
[user: accept] · feedback registered → Pastor learning
```

---

### Q7 — Mais features statusline (didactic mode)

#### Solução Mooter — `mooter dashboard` full TUI

**`mooter dashboard` — interactive TUI (Ratatui):**

```
╔═══════════════════════════════════════════════════════════╗
║  🐮 MOOTER DASHBOARD · v1.19 · Your LLM Router            ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ║
║                                                           ║
║  ┌─ TODAY ─────────────────┐ ┌─ HARDWARE ─────────────┐  ║
║  │ 💰 Saved $1.27 (73%)    │ │ 🎮 RTX 4090            │  ║
║  │ 🏠 Local: 60% (12/20)   │ │ VRAM: 22.3/24 GB (93%) │  ║
║  │ ⚡ Avg latency: 0.8s    │ │ Models loaded: 2        │  ║
║  │ 📊 Prompts: 20          │ │ Workers: 8 concurrent  │  ║
║  └─────────────────────────┘ └────────────────────────┘  ║
║                                                           ║
║  ┌─ PASTOR (your AI that learns) ────────────────────┐   ║
║  │ 🧬 Trained on 260 decisions                       │   ║
║  │ 🧠 Active: frontend adapter (+3.2pp accuracy)     │   ║
║  │ 📈 Top adapter: prose-pt-pt (+12pp this week)     │   ║
║  │ 🔄 Next training: tonight at 02:00 (overnight)    │   ║
║  └───────────────────────────────────────────────────┘   ║
║                                                           ║
║  ┌─ TIER DISTRIBUTION (last 10) ─────────────────────┐   ║
║  │ T0 local  ▓▓▓▓▓▓░░░░ 60%                          │   ║
║  │ T1 Haiku  ▓▓▓░░░░░░░ 30%                          │   ║
║  │ T2 Sonnet ▓░░░░░░░░░ 10%                          │   ║
║  │ T3 Opus   ░░░░░░░░░░  0%                          │   ║
║  └───────────────────────────────────────────────────┘   ║
║                                                           ║
║  ┌─ ACTIVE WORKFLOWS ────────────────────────────────┐   ║
║  │ 🐄 audit-codebase #42 · Phase 2/4 · 67%           │   ║
║  └───────────────────────────────────────────────────┘   ║
║                                                           ║
║  ┌─ LIMITS ──────────────────────────────────────────┐   ║
║  │ 🔒 Workflow cost cap: $5.00 (using $0.00)         │   ║
║  │ 🔒 Session cap: $50.00 (using $1.27)              │   ║
║  │ 🔒 T3 rate: 0 of 30/5min                          │   ║
║  └───────────────────────────────────────────────────┘   ║
║                                                           ║
║  [r] refresh · [w] watch workflow · [q] quit              ║
╚═══════════════════════════════════════════════════════════╝
```

**Cmds adicionais:**
- `mooter dashboard` — full TUI (above)
- `mooter dashboard --web` — opens browser dashboard
- `mooter status` — single-line summary
- `mooter status --verbose` — multi-line explanation

---

## Part 3 — Wave 32 proposta detalhada

### Wave 32 — Transparency + Performance Layer (mega)

**Tag esperada:** `v1.20.0-transparency-performance`
**Estimate:** ~24h CC autonomous (modo ultracode — precedent Wave 30 fez 30h em 1h19, esperado ~1.5h real)

#### Phases (14 phases A-N)

| Phase | Goal | Tier | Effort |
|---|---|---|---|
| A | Day 0 honest recon | T0/T1 | 0.5h |
| B | Statusline refinement (Starship/CShip inspired, 4 modes) | T2 | 3h |
| C | Inline token tracker per command/prompt | T2 | 2h |
| D | `mooter dashboard` full TUI (Ratatui) | T3 | 4h |
| E | `mooter workflow watch` Ralph TUI inspired | T3 | 3h |
| F | LoRA training observability (`mooter pastor train-watch`) | T2 | 3h |
| G | Quantization + Vector status chips | T1 | 1.5h |
| H | vLLM backend opt-in installer (`mooter backend install vllm`) | T2 | 3h |
| I | Multi-LoRA serving via vLLM (Pastor v2 integration) | T3 | 4h |
| J | Hub `/v1/transparency-telemetry` + migration 017 | T2 | 1.5h |
| K | Test suite + integration tests | T2 | 2h |
| L | Docs + screenshots + demo recordings | T1 | 1.5h |
| M | Final-reviewer + PR + merge + tag | T3 | 1h |
| N | Notion auto-write + memory update via MCP | T1 | 0.5h |

**Doctrine non-negotiable** (mantido):
- classify.js sha INTACT
- Wave 28-31 packages INTOCADOS
- Statusline linhas 1-2 byte-idênticas (linha 3+ opt-in)
- Pastor v1 schema preservado
- vLLM é OPT-IN (default Ollama)
- Tag pós-merge

---

## Part 4 — Mock-ups visuais consolidados

Todos os 7 mocks acima + adicional:

**`mooter status --verbose` output:**

```
🐮 Mooter v1.19 — Your LLM router. Local-first. Learns forever.
─────────────────────────────────────────────────────────────────

TODAY (since 00:00 BRT)
  💰 Total saved: $1.27 of $1.74 baseline (73% saved)
  🏠 Local execution: 60% (12 of 20 prompts)
  ⚡ Avg first-token latency: 0.8s
  📊 Tier distribution: T0=6 T1=3 T2=1 T3=0

THIS TURN
  ☁️  Routed to Opus 4.8 (T3) with confidence 0.90
  💭 Reason: "complex architecture decision detected"
  📝 Tokens: 273k consumed, 856 generated
  💸 Cost: $0.09 (within $50 session cap)

PASTOR (continuous learning)
  🧬 Pastor v1.2 active · trained on 260 decisions
  🧠 Active adapter: frontend (+3.2pp accuracy)
  📈 Top performer this week: prose-pt-pt (+12pp)
  🔄 Next overnight training: 02:00 (in 1h)

HARDWARE
  🎮 RTX 4090 · 13% VRAM (3.1/24 GB used)
  📦 Models loaded: qwen2.5-coder:7b (Q4_K_M, 4.5 GB)
  💡 Upgrade available: load qwen3:30b for adversarial review

LIMITS (cost cap + anomaly detection)
  🔒 Workflow cap: $5.00 (current: $0.00, 0% used)
  🔒 Session cap: $50.00 (current: $1.27, 2.5% used)
  🔒 T3 rate: 0 of 30 per 5min (OK)
  🔒 Workflow concurrency: 0 of 3 (OK)

For more: mooter dashboard (full TUI)
```

---

## Part 5 — Anti-patterns (o que NÃO fazer)

| # | Anti-pattern | Razão | Mooter avoids by |
|---|---|---|---|
| 1 | Statusline render > 50ms | Lag in shell prompt | Starship-style ≤10ms render budget |
| 2 | Cloud dashboard mandatório (W&B obrigatório) | Lock-in + privacy | Local TUI first, W&B opcional |
| 3 | Esoteric symbols sem explanation | "What does T3:273.6k mean?" | Tooltips + didactic mode |
| 4 | Cores demasiado vivas | Acessibilidade + WCAG | Catppuccin/muted palette options |
| 5 | TUI flickering on update | Eye strain | DEC synchronized output protocol |
| 6 | vLLM como default | Mac users excluded | Default Ollama, vLLM opt-in |
| 7 | TensorBoard cloud-only | Privacy violation | Local TB-equivalent via Ratatui |
| 8 | Pause/resume sem state persist | Lost work on resume | SQLite checkpoint (Wave 28 base) |
| 9 | Token cost approximate | User mistrust | Use published provider pricing exact |
| 10 | LoRA progress vague | "Looks better" not enough | Per-task scores + baseline comparison |

---

## Part 6 — Honra check vs filosofia V4+V5

| Princípio V4 | Cumprido? | Como |
|---|---|---|
| 1. No proxy | ✅ | Transparency Layer NÃO senta entre user e LLM |
| 2. Zero LLM cost na classificação | ✅ | Statusline render usa regex/local state, zero LLM |
| 3. Doctrine > configuration | ✅ | TUI defaults markdown, não YAML |
| 4. Explainability | ✅✅✅ | **CORE deste layer** |
| 5. Doctrine nunca cede ao optimizador | ✅ | classify.js continua hard guardrail, dashboard apenas mostra |
| 6. Subscription-aware (V4 §1.3) | ✅ | Pricing info per provider mostra contexto subscription |
| 7. Honest savings (não 95%) | ✅ | Real numbers per provider |
| 8. Local-first | ✅ | Ratatui local, vLLM opt-in |

**8/8 doctrine honored.** Anthropic-grade.

---

## Part 7 — Sources canónicos consultados (research 2026)

### Statusline design
- [Starship Pastel Powerline Preset](https://starship.rs/presets/pastel-powerline)
- [Starship Catppuccin Powerline](https://starship.rs/presets/catppuccin-powerline)
- [CShip — Statusline for Claude Code (GitHub)](https://github.com/stephenleo/cship)
- [claude-statusline (Felipe Elias)](https://felipeelias.github.io/2026/03/17/claude-statusline.html)
- [Setting Up Pretty Mac Terminal 2026](https://medium.com/@yi.cheng/setting-up-the-pretty-mac-terminal-in-2026-ghostty-starship-catppuccin-0420189ad43f)
- [Powerlevel10k Life Support, Hello Starship](https://hashir.blog/2025/06/powerlevel10k-is-on-life-support-hello-starship/)

### Multi-agent TUI
- [Ralph TUI: Mission Control Dashboard (Verdent)](https://www.verdent.ai/guides/ralph-tui-ai-agent-dashboard)
- [Ratatui GitHub](https://github.com/ratatui/ratatui)
- [TUI Frameworks Comparison 2026 (melker)](https://github.com/wistrand/melker/blob/main/agent_docs/tui-comparison.md)
- [DeepSeek-TUI 2026 Guide](https://tosea.ai/blog/deepseek-tui-terminal-coding-guide-2026)
- [Ratatui Comprehensive Guide (Eric Moreira)](https://medium.com/@e_moreira/building-interactive-terminal-user-interfaces-with-ratatui-a-comprehensive-guide-to-creating-a-c6f39b0b8742)

### vLLM vs Ollama concurrent serving
- [Ollama vs vLLM 2026: When Heavyweight Worth It (aifoss)](https://aifoss.dev/blog/ollama-vs-vllm-2026/)
- [Ollama vs vLLM Comparison 2026 (Particula)](https://particula.tech/blog/ollama-vs-vllm-comparison)
- [vLLM vs Ollama 9x Throughput Gap Tested (tech-insider)](https://tech-insider.org/vllm-vs-ollama-2026/)
- [vLLM Multi-Model Serving Single GPU (Lyceum)](https://lyceum.technology/magazine/multi-model-serving-single-gpu-vllm/)
- [Benchmarking Ollama and vLLM (DOI 10.3390)](https://doi.org/10.3390/app16115435)
- [Local LLM Deployment 2026 (QubitTool)](https://qubittool.com/blog/local-llm-deployment-2026-ollama-vllm-optimization)

### LoRA training observability
- [Use Serverless LoRA Inference (W&B Docs)](https://docs.wandb.ai/inference/lora)
- [Fine-Tune Local LLMs 2026 (SitePoint)](https://www.sitepoint.com/fine-tune-local-llms-2026/)
- [QLoRA Fine-Tuning 2026 Guide (LocalAIMaster)](https://localaimaster.com/blog/qlora-fine-tuning-guide)
- [TensorBoard + LoRA Civitai](https://civitai.com/articles/83/using-tensorboard-to-analyze-training-data-and-create-better-models)
- [TRL Library Tutorial (Medium)](https://medium.com/@danushidk507/trl-transformer-reinforcement-learning-library-2-59186d66ac0b)

### Cross-reference da pesquisa Mooter anterior
- `docs/strategy/MOOTER_ULTIMATE_VISION.md` (16 layers V5, 60+ sources)
- `docs/strategy/MOOTER_STRATEGIC_SYNTHESIS.md` (10 tópicos research)
- `docs/strategy/MOOTER_DYNAMIC_WORKFLOW_LOCAL.md` (Workflow Engine design)

**Total Wave 32 sources:** ~25 NEW + 60+ existing = **85+ sources canónicos rastreáveis.**

---

## Part 8 — A grande síntese (60 seconds read)

| Dimensão | Estado pré-Wave32 | Pós-Wave32 |
|---|---|---|
| **Statusline render budget** | sem constraint | ≤10ms (Starship-grade) |
| **Statusline modes** | 1 (default) | 4 (mini/compact/full/didactic) |
| **Per-command transparency** | acumulado apenas | inline tags real-time |
| **LoRA training visibility** | counter "260 decisions" | TUI dashboard live |
| **Quant/vector observability** | nenhum | chips + `mooter quant status` |
| **Workflow visualization** | static text | Ratatui Mission Control animated |
| **Hardware utilization** | passive (13% VRAM unused) | active (vLLM opt-in, multi-LoRA) |
| **Throughput max** | Ollama sequential | vLLM 16.6× concurrent (opt-in) |
| **Multi-LoRA serving** | swap reload 30s | <10ms hot-swap |
| **Score 10 critérios** | 90 pós-Wave31 | **96/100** |

---

## Part 9 — A frase ultimate

> *"Mooter v1.20: not just a router. A **transparent operating system** for your LLMs — locally, multi-model, multi-LoRA, with Anthropic-grade observability. Where every prompt, every cent, every adapter, every GPU watt is **visible, explainable, optimizable**."*

---

## Part 10 — Próximo passo concreto

1. **Tu:** confirma "GO Wave 32" depois de Wave 31 SHIPPED.
2. **Eu:** componho `WAVE32_TRANSPARENCY_PERFORMANCE_KICKOFF.md` (master prompt CC autonomous, ~600 linhas).
3. **CC autonomous:** executa Wave 32 (14 phases A-N, ~24h estimate / ~1.5h real em ultracode).
4. **Resultado:** Mooter v1.20 com tudo o que Paulo pediu materializado.

**Critério sucesso:** *"Qualquer vibe coder abre `mooter dashboard` pela primeira vez e em 5 segundos entende: o que Mooter faz, quanto está a poupar, quão local está, e o que está a aprender."*

---

*Doc composto pelo Cowork enquanto Wave 31 CC corre. Pre-Wave 32 strategic. Filosofia V4+V5 honrada 8/8.*
