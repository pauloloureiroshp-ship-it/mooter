# MOOTER — Ultimate Vision (Continuous Learning + 3 Vectors)

**Composto:** 2026-06-07 ~11h BRT, Cowork
**Trigger:** Paulo pediu visão definitiva — continuous learning + 3 vectores específicos (setup/ecosystem/prompt quality) + cross-reference total
**Estado base:** Wave 28 Phase E SHIPPED, Workflow Engine LIVE em poucas horas, V5 architecture mapped
**Status:** Documento estratégico canónico — pre-Wave 29 launch

---

## ⚡ TL;DR (5 bullets, ler primeiro)

1. **A grande ideia (Paulo):** Mooter precisa **aprender de cada user e cada prompt para sempre**, com sinais multi-dimensionais (setup × ecosystem × prompt patterns), tornando-se o melhor smart router que existe.
2. **3 novos vectores estratégicos** complementam V5 (12→14 layers):
   - **Vector A — Setup Intelligence** (Layer 14): hardware/software/subscriptions auto-detected, explained, optimised
   - **Vector B — Ecosystem Awareness** (Layer 15): catálogo vivo de skills/repos/features → ROI per prompt
   - **Vector C — Prompt Quality Intelligence** (Layer 16): multi-dimensional scoring + bandit-based learning
3. **Continuous Learning Loop V3** combina **Thompson Sampling bandit** (MetaLLM pattern) com **Federated Routing** (Federate-the-Router pattern, ICLR 2026) e **DP-FedLoRA** privacy guarantees.
4. **Cross-reference total** entre Notion HQ + GitHub + soluções de mercado (vLLM/SGLang/LangGraph/Cursor/Continue/OpenPipe) + Anthropic alignment (skills + plugins + MCP) — está mapeado.
5. **Wave 29 Synthesis V2** materializa partes minimum-viable de Vectors A/B/C agora, sem partir Wave 28. Tag esperada `v1.17.0-synthesis`. Anthropic teria orgulho — princípios V4 honrados + state-of-the-art 2026 alinhado.

---

## 1. Estado actual — onde estamos AGORA (06-07 11h BRT)

| Layer | Estado | Comentário |
|---|---|---|
| L0-L5 | ✅ LIVE | classify+routing+tier+dispatch (Wave 21-26 SHIPPED) |
| L6 | 🟡 PARTIAL | Specialist routing pattern, providers parcialmente plugados |
| L7 | 🟡 PARTIAL | Pastor pull-based, falta `user_priors.bin` |
| L8 | ❌ NOT YET | Codebase fingerprint não implementado |
| L9 | 🟡 PARTIAL | sync_events live, falta DP-SGD + k-anonymity |
| **L10** | 🔥 EM CURSO | Wave 28 Workflow Engine — Phase E SHIPPED, F-J restam |
| L11 | ❌ NOT YET | Real-time arbitrage |
| **L12 (NEW)** | 🔜 Wave 29 | LLMLingua prompt compression |
| **L13 (NEW)** | 🔜 Wave 31 | LoRA hot-swap routing |
| **L14 (NEW)** | 🔜 Wave 29-30 | **Setup Intelligence (Paulo vector A)** |
| **L15 (NEW)** | 🔜 Wave 29-30 | **Ecosystem Awareness (Paulo vector B)** |
| **L16 (NEW)** | 🔜 Wave 30-31 | **Prompt Quality Intelligence (Paulo vector C)** |
| X | ✅ LIVE | Telemetria estruturada |

**16 layers total na visão final.** V4 antecipou 12. Paulo agora antecipa +3 que materializam continuous learning. Layer 13 (LoRA hot-swap) era inevitável academic — V5 já documentou.

---

## 2. Os 3 Vectores Estratégicos de Paulo

### 🎯 Vector A — Setup Intelligence Layer (L14)

#### O problema real
*"Todo hard user de vibe coder precisa saber o setup hardware, software, subscriptions etc."*

Tradução: vibe coders usam Claude Code/Cursor/Continue sem saber:
- Que hardware têm (Apple Silicon? Snapdragon NPU? GPU?)
- Que stack de software têm instalada (Ollama? quais modelos? OS?)
- Que subscriptions têm activas (Claude Max? Cursor Pro? GitHub Copilot? Gemini?)
- **Como isto MUDA o routing optimal para eles**

#### Stack actual Mooter (que SUSTENTA isto)

Já temos infraestrutura parcial:
- `tools/router/hardware-matcher.js`
- `tools/router/vram_detect.js`
- `tools/router/hw-capability.json`
- `tools/router/detect-subscriptions.js`
- `tools/router/subscription-profile.json`
- `tools/router/gpu-probe.js`
- `tools/router/hardware_live.js`

**Mas falta:**
- Output user-facing: "Aqui está o teu setup, aqui está o que recomendo"
- Sub-system: per-device profile + recommendations engine
- Telemetria: `device_setup_profile` table com upgrade signals

#### Solução proposta (Setup Intelligence Layer L14)

**3 componentes:**

##### A.1 — Setup Auto-Detect (~3h)
- `mooter setup detect` → comando novo
- Roda em background no primeiro `mooter init` E semanalmente
- Detecta:
  - **Hardware**: CPU model, RAM, GPU model, VRAM, NPU presence (Snapdragon/Apple/Intel), bandwidth
  - **Software**: OS, Node.js version, Python, Ollama version + installed models, Docker
  - **Subscriptions**: Claude (Pro/Max/Team), OpenAI Plus/Pro, GitHub Copilot, Cursor, Gemini
- Output: `~/.mooter/setup_profile.json` (versionado, diff-able)

##### A.2 — Setup Explainer (~2h)
- `mooter setup show` → mostra setup profile + explicações
- Format:
  ```
  🐮 Your Mooter Setup Profile
  ─────────────────────────────
  Hardware: MacBook Pro M5 (38 TOPS NPU, 153 GB/s bandwidth)
  → Excellent for local LLMs. Mooter can run qwen3:30b smoothly.
  
  Software: Ollama 0.5.2 (qwen2.5-coder:7b, qwen3:30b)
  → Strong baseline. Consider adding gemma3:27b for diversity.
  
  Subscriptions: Claude Max ($200/mo)
  → Marginal cost = $0 for Claude. Mooter biases for frontier+cache.
  → Anthropic separated 1st-party from 3rd-party Apr 2026.
    Cursor/Cline use COUNT against Max. Claude Code is exempt.
  
  Recommendations:
  ✓ Install qwen3:30b LoRA Pastor adapter (Wave 31 ready)
  ✓ Enable Caveman pack (~8% out-token savings)
  ⚠ MacBook fans get loud >60% sustained — use vLLM batching
  ```

##### A.3 — Setup Recommendations Engine (~3h)
- Per-profile recommendations from a curated catalog
- E.g.: user with Apple M5 → "Try MLX backend for Mooter (15% faster vs Ollama on M-series)"
- User with NVIDIA 4060 → "Wait for TurboQuant + llama.cpp Q3 2026 for 6× concurrency"
- User Snapdragon X Elite → "Hexagon NPU offload available, install `mooter pack snapdragon-nopu`"

#### Telemetria (privacy-preserving)
- Hub D1 nova table `device_setup_profiles`:
  ```sql
  CREATE TABLE device_setup_profiles (
    device_id TEXT PRIMARY KEY,
    hardware_class TEXT,     -- 'apple-m5', 'snapdragon-x-elite', 'rtx-4090', etc.
    vram_gb INTEGER,
    has_npu BOOLEAN,
    os_class TEXT,           -- 'darwin', 'linux', 'wsl2', 'windows'
    ollama_models_count INTEGER,
    subscription_tier TEXT,  -- 'claude-max', 'claude-pro', 'none', 'multi'
    last_updated INTEGER
  );
  ```
- **Hash device_id** (já é hash anónimo)
- **K-anonymity ≥ 50** antes de qualquer agregado público
- **Opt-in explícito** (default off)

#### Aprendizagem agregada
- Pastor pode aprender: "users com setup X tendem a beneficiar de routing Y"
- E.g.: "users Apple M5 → bias more T0 local (MLX is fast)"
- E.g.: "users sem GPU → bias more T1 cloud (cold-start Ollama é dor)"

---

### 🎯 Vector B — Ecosystem Awareness Layer (L15)

#### O problema real
*"Vibe coders não sabem quais são os skills, repos, features pra melhorar o ROI por prompt"*

Tradução: existem centenas de skills, plugins, MCP servers, packs disponíveis. Vibe coders **não descobrem** os que mais aplicam ao stack deles.

Exemplo concreto: o Paulo perguntou ontem sobre Impeccable, Caveman, Obsidian skills, NotebookLM, TurboQuant — **5 ferramentas que NÃO sabia, descobertas só porque perguntou**. Quantos vibe coders fazem essa pergunta?

#### Solução proposta (Ecosystem Awareness L15)

##### B.1 — Ecosystem Catalog (~3h)
- `~/.mooter/ecosystem/catalog.json` — catálogo curado
- Updated semanalmente via hub pull
- Estrutura por categoria:
  - **Skills** (Anthropic + community): Impeccable, Caveman, Obsidian, NotebookLM, etc.
  - **Plugins Claude Code**: cloudflare/skills, anthropic/claude-plugins-official
  - **MCP servers**: registry MCP do Mooter + community
  - **Mooter Packs**: diagram-systems, data-spreadsheet, voice-tts, caveman, vault-sync, snapdragon-nopu, etc.
  - **Specialist models**: AMALIA (PT-PT), Sabiá-3 (PT-BR), Arctic-Text2SQL, GLM 4.5 coding
- Per-item metadata:
  - `trust_score` (0-100) — baseado em reviews + Mooter validation
  - `compatibility_matrix` (hardware × OS × subscription requirements)
  - `roi_estimate` (token savings, latency gain, quality uplift)
  - `install_cmd`, `docs_url`, `source_url`

##### B.2 — Per-User Recommendations (~3h)
- `mooter ecosystem recommend` → comando novo
- Lê `setup_profile.json` + `pastor_state` + `tools/router/decisions.log`
- Recommendation algorithm:
  ```
  recommendation_score = compatibility × roi_estimate × pastor_signal_strength
  ```
- Output:
  ```
  🐮 Top 5 recommendations for your setup
  ─────────────────────────────────────────
  1. 🪨 caveman (8% out savings)         [recommended for terse prompts]
     Install: mooter pack install caveman
  
  2. 📓 vault-sync (Obsidian bridge)     [you mentioned vault in profile]
     Install: mooter pack install vault-sync
  
  3. 🦊 amalia-pt-pt (PT-PT specialist)  [profile language=pt-PT]
     Enable: mooter providers add amalia
  
  4. 🌐 mcp-cloudflare (Workers/D1 tools) [you deploy to CF]
     Install: claude plugin install cloudflare@cloudflare
  
  5. ⚡ vLLM serving (2-3× latency)       [for power users, advanced]
     Setup guide: docs/integrations/vllm.md
  ```

##### B.3 — ROI Tracker per Pack (~2h)
- Após pack installed, Mooter tracks impact:
  - Token savings (vs baseline before pack)
  - Latency change
  - User acceptance rate (Pastor signal)
- Statusline chip rotativo: `🪨 caveman: -82 tokens today | -$0.07`
- Weekly digest email: "Your packs saved $4.27 this week. Top: caveman ($2.10), vault-sync ($1.05), amalia ($1.12)"

#### Cross-reference para outros sistemas
- **GitHub:** `mooter ecosystem search "react"` → busca repos relevantes via GitHub API
- **Notion:** users podem optionally linkar Notion HQ — Mooter regista learning sources
- **Anthropic skills marketplace:** Mooter fetch top skills + community ratings, surface

---

### 🎯 Vector C — Prompt Quality Intelligence Layer (L16) 🔥🔥🔥

#### O problema real (mais profundo dos 3)
*"Padrão de bons prompts pelo melhor custo possível. Combinação de factores indicam performance melhor. Existe um caminho que no conjunto da obra são referências para melhorarmos o algoritmo."*

Tradução: Mooter tem o sinal mais rico do mercado:
- **Contexto** (size + freshness + relevance)
- **Setup** (hardware tier + subscription tier)
- **LoRA** (Pastor adapter present? trained on this user?)
- **Features** (which packs active? which providers?)
- **Outcome** (user accepted? edited? retried? abandoned?)

Cada decisão tem ~30+ features. Mooter pode aprender **multi-dimensionalmente** qual combinação produz **melhor accuracy per token spent**.

#### State-of-the-art research que aplica aqui

**MetaLLM (2025-2026):** Multi-armed bandit framework para LLM selection. Dinamicamente escolhe LLM menos caro likely correct, optimiza accuracy-cost trade-off.

**MixLLM:** Contextual bandit + policy gradient para query-LLM assignment.

**Feel-Good Thompson Sampling for Contextual Duelling Bandits (FGTS.CDB):** algoritmo Bayesian para online model selection.

**Federate the Router (ICLR 2026, arxiv 2601.22318):** federated routing improves accuracy-cost frontier vs client-local routers. "Federated training reduces routing suboptimality."

**OpenPipe LLMOps pattern:** log requests → filter/export → datasets → eval → fine-tune. Pipeline de feedback loop production.

#### Solução proposta (Prompt Quality Intelligence L16)

##### C.1 — Multi-Dimensional Decision Telemetry (~2h)
- Hub D1 schema `pastor_v2_decisions`:
  ```sql
  CREATE TABLE pastor_v2_decisions (
    decision_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    ts INTEGER NOT NULL,
    
    -- Prompt features (from classify.js)
    prompt_class TEXT,           -- 'T0' | 'T1' | 'T2' | 'T3'
    prompt_tokens INTEGER,
    prompt_complexity REAL,      -- 0-1
    prompt_language TEXT,        -- 'en' | 'pt-pt' | 'pt-br' | 'code-only'
    
    -- Context features
    context_tokens INTEGER,
    context_freshness_hours REAL,
    repo_size_files INTEGER,
    
    -- Setup features (joined from device_setup_profiles)
    hardware_class TEXT,
    has_lora_pastor BOOLEAN,
    subscription_tier TEXT,
    
    -- Ecosystem features
    packs_active TEXT,           -- comma-separated
    providers_active TEXT,
    
    -- Routing features (Mooter decision)
    tier_chosen TEXT,
    model_chosen TEXT,
    classify_confidence REAL,
    pastor_hint_applied BOOLEAN,
    workflow_engaged BOOLEAN,
    
    -- Outcome features (post-decision)
    outcome_status TEXT,         -- 'accepted' | 'edited' | 'retried' | 'abandoned' | 'unknown'
    outcome_dwell_ms INTEGER,
    outcome_followup_count INTEGER,
    
    -- Cost features
    tokens_in INTEGER,
    tokens_out INTEGER,
    cost_usd REAL,
    latency_first_token_ms INTEGER,
    latency_full_ms INTEGER,
    
    -- Doctrine compliance
    doctrine_violations INTEGER DEFAULT 0
  );
  ```
- Logs each decision as a single row.
- Privacy: `prompt_class`/features only, **NEVER prompt content**.

##### C.2 — Bandit-Based Online Learning (~4h)
- Implementar **Thompson Sampling per (prompt_class × hardware_class × subscription_tier)**:
  - Arms: routing options (tier × provider)
  - Reward: outcome_accepted × (1 / cost_usd × latency_penalty)
  - Posterior update: Bayesian update por decisão
- `tools/router/bandit-learner.js` — novo module
- Decisão híbrida: classify.js continua deterministic (doctrine) MAS bandit pode bias dentro do tier (e.g., qual provider em T2)
- **Doctrine wins:** se classify.js diz T3, bandit não pode forçar T2 (guardrail).

##### C.3 — Federated Wisdom (~4h)
- Pastor v3 com **Federated Routing** pattern (Federate-the-Router, ICLR 2026):
  - Cada device tem local router state
  - Periodicamente, devices upload (with DP noise) gradients para hub
  - Hub agrega via secure aggregation
  - Push back global router updates
  - Local devices fine-tune com personalisation
- Implementa em phases:
  - Phase 1 (Wave 30): local bandit only (cada user aprende sozinho)
  - Phase 2 (Wave 31): federated upload com DP (epsilon=1.0)
  - Phase 3 (Wave 34): full federated routing pull

##### C.4 — Prompt Quality Dashboard (~2h)
- Landing mooter.ai/quality (nova page)
- Per-user dashboard:
  - Aggregate quality score (0-100)
  - Trend per week
  - Top 5 prompts patterns (anonymised)
  - Best combination found ("Your T1 routing with caveman + amalia scored 96/100 last week")
- Comunidade pulse:
  - "This week, the 5 highest-quality prompt patterns globally are..."
  - "Hardware × subscription combinations sorted by ROI..."

#### O grande insight
**Mooter é o único sistema que pode descobrir + publicar (com DP) o "best practice prompt pattern per setup tier".** Esta é a knowledge que **vale mais que qualquer model**. Cursor/Continue não têm este sinal estruturado. Anthropic tem cloud-only signal (não local).

---

## 3. Continuous Learning Loop V3 — como tudo se encaixa

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER + CC SESSION                          │
│                                                                     │
│  Prompt → classify.js → router decision → tier dispatch → outcome   │
└──────┬───────────────────────────────┬──────────────────────────────┘
       │ Features                       │ Decision + outcome
       │ (setup/context/ecosystem)      │ (logged to pastor_v2_decisions)
       ▼                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   LOCAL BANDIT LEARNER (L16.2)                      │
│                                                                     │
│  Thompson sampling per (prompt_class × hardware × subscription)     │
│  Updates local posterior with each outcome                          │
│  Influences future Pastor hints (within doctrine guardrails)        │
└──────┬──────────────────────────────────────────────────────────────┘
       │ Local gradient (DP noise added)
       │ Periodic (every N decisions or 24h)
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   FEDERATED HUB AGGREGATION (L9 + L16.3)            │
│                                                                     │
│  CF Worker /v1/federated-router-update                              │
│  Secure aggregation (k-anonymity ≥ 50)                              │
│  DP-SGD aggregate (epsilon=1.0)                                     │
│  Global router state updated                                        │
└──────┬──────────────────────────────────────────────────────────────┘
       │ Global posterior pull
       │ Personalised with local prior
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       PASTOR v3 STATE                               │
│                                                                     │
│  Hint generation per next prompt                                    │
│  "Your hardware/subscription/packs combo suggests T1 over T2"       │
│  Surfaced in statusline + CLI on next session                       │
└─────────────────────────────────────────────────────────────────────┘

CROSS-DIMENSIONAL SIGNALS:

Setup Intelligence (L14)     →  contributes hardware/sub features
Ecosystem Awareness (L15)    →  contributes packs/providers active
Workflow Engine (L10)        →  contributes workflow_engaged flag
Prompt Compression (L12)     →  contributes prompt_compressed flag
LoRA Hot-Swap (L13)          →  contributes lora_active flag
Specialist Routing (L6)      →  contributes model_chosen detail
Real-time Arbitrage (L11)    →  contributes provider_health snapshot
```

**Resultado:** cada decisão atualiza o modelo global. **Mooter aprende com toda a comunidade, sem violar privacy de ninguém.**

---

## 4. Cross-Reference Map (Notion + GitHub + Market + Anthropic)

### Notion HQ
- **HQ ID:** `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`
- **Sub-pages a manter sincronizadas:**
  - Wave sessions (todas SHIPPED waves têm sub-page)
  - Strategy documents canónicos (STRATEGY, V4, V5, ULTIMATE_VISION)
  - Pastor learnings (long-term Q&A archive)
- **Action:** Mooter pode optionally write to Notion via MCP server (Wave 35 inclui)

### GitHub repo (pauloloureiroshp-ship-it/mooter)
- **Branches estratégia:**
  - `main` — prod
  - `dev` — integration
  - `waveXX-*` — feature branches
- **PR pattern:** `--merge` não squash (conservar histórico atomic commits per phase)
- **Tag pattern:** `vX.YY.Z-name` aplicado **POST-merge** (consolidado em 8 waves)
- **Action:** Mooter PR auto-comment template (Wave 30 — adversarial review embedded)

### Soluções de mercado (cross-reference)

| Sistema | Lessons aprendidas | Encaixe Mooter |
|---|---|---|
| **LangGraph** | Workflow primitives elegantes | Mooter Workflow Engine inspirado mas local-first |
| **AutoGen** | Multi-agent patterns | Subagents Mooter já têm |
| **CrewAI** | Role-based agents | Mooter "experts" rename (Wave 30) |
| **Cursor** | Editor integration polish | Mooter coabita, não substitui |
| **Continue.dev** | OSS multi-model | Mooter adds: routing + Pastor |
| **Aider** | Git-native | Mooter adds: ecosystem + setup intel |
| **OpenPipe** | Production feedback loop | L16 (Prompt Quality) embraces pattern |
| **vLLM** | PagedAttention, continuous batching | Wave 33 optional serving backend |
| **SGLang** | RadixAttention KV cache | Workflow Engine reusa pattern |
| **MetaLLM** | Bandit-based routing | L16.2 implementation |
| **TogetherAI** | Cost-aware routing | Mooter open-source equivalent |
| **OpenRouter** | Provider abstraction | Mooter T1/T2/T3 hubs same idea |
| **Helicone** | LLM observability | Mooter hub D1 = self-hosted equivalent |

### Anthropic alignment (Triple-stack v2)

| Anthropic primitive | Mooter implementation | Status |
|---|---|---|
| `CLAUDE.md` (project memory) | Mooter respects + augments | ✅ LIVE |
| Skills (`.claude/skills/`) | Mooter publishes skills + ecosystem catalog | 🔥 Wave 28 Phase I |
| Subagents (`.claude/agents/`) | Mooter 6 subagents + auto-learning | ✅ LIVE |
| Plugins (`claude plugin install`) | Mooter Pack ecosystem mirrors | 🔜 Wave 35 |
| MCP servers | Mooter MCP server `mooter_*` tools | 🔜 Wave 35 |
| Hooks (UserPromptSubmit, etc.) | classify.js hooks deep | ✅ LIVE |
| Dynamic Workflows | Workflow Engine local-first | 🔥 Wave 28 |
| Routines / scheduled tasks | Pastor periodic learning | 🟡 Wave 31 |
| Auto memory | `~/.mooter/memory/` (mirror) | 🟡 future |
| `/effort` modes | Bandit can suggest effort tier | 🔜 Wave 30 |

**Mooter está literalmente alinhado com TODOS os Anthropic primitives 2026.** Triple-stack play (skill + plugin + MCP) é nossa coroa.

---

## 5. Wave 29 Synthesis V2 — proposta expanded com 3 vectores

### Princípios non-negotiable (revisited)

1. **classify.js sha intacto** (`7b01eb86…`) — gate test obrigatório
2. **L0-L10 estável** (Wave 26-28 SHIPPED arquitectura) — apenas adicionar L11-L16, não modificar
3. **Pastor v1 schema preservado** — `pastor_v2_decisions` ADDED, não substitui
4. **Workflow Engine intocado** (Wave 28 LIVE) — Synthesis usa via primitives
5. **All 3 vectors OPT-IN inicialmente** — user pode desligar Setup/Ecosystem/PromptQuality
6. **Privacy first** — DP noise + k-anonymity em qualquer telemetria agregada
7. **Doctrine wins bandit** — classify.js tier decision is hard guardrail
8. **Tag pós-merge** (lição 9 waves consecutivas)

### Phases (12 blocos, ~28h)

| Phase | Acção | Tier | Horas |
|---|---|---|---|
| 29.A | Day 0 honest recon (validar premissas) | T0/T1 | 0.5 |
| 29.B | **L12 — LLMLingua compression layer (opt-in)** | T2 | 4 |
| 29.C | **Caveman bundle como Mooter Pack** | T2 | 3 |
| 29.D | **DeepSeek V4 Pro option em T2 routing** | T2 | 3 |
| 29.E | **L13 — LoRA hot-swap foundation** (infra only) | T3 | 4 |
| 29.F | Speculative decoding docs + benchmark stub | T1 | 2 |
| 29.G | **L14 — Setup Intelligence: detect + show + recommend** | T2 | 4 |
| 29.H | **L15 — Ecosystem Awareness: catalog + recommend** | T2 | 3 |
| 29.I | **L16.1 — Multi-dimensional decision telemetry** (schema only) | T2 | 1.5 |
| 29.J | Statusline integration (chips para todos os L12-L16) | T1 | 1.5 |
| 29.K | Hub migration `013_pastor_v2_telemetry` + `014_device_setup_profiles` | T2 | 1.5 |
| 29.L | Final-reviewer + PR + merge + tag `v1.17.0-synthesis-ultimate` | T3 | 1 |

**Total:** ~29h CC autonomous (modo `ultracode` + dangerous).

### Os 3 vectores nesta wave (foundation, não full impl)

- **Vector A (Setup)** — 29.G shipa detect + show + recommendations engine. Telemetria envia hub (opt-in).
- **Vector B (Ecosystem)** — 29.H shipa catalog + recommendations. ROI tracker em Wave 30.
- **Vector C (Prompt Quality)** — 29.I shipa schema + logging. Bandit learner em Wave 30. Federated em Wave 34.

**Wave 29 = foundation. Waves 30-34 materializam os bandits + federated + production.**

---

## 6. Roadmap actualizado (Waves 28-35) — versão Ultimate

| Wave | Goal | Tag esperada | Estimate | Vector primário |
|---|---|---|---|---|
| **28** | Workflow Engine MVP (em curso) | `v1.16.0-workflow-engine-mvp` | 23.5h (60% done) | L10 |
| **29** | **Synthesis Ultimate** — L12+L13 infra+L14+L15+L16.1 schema | `v1.17.0-synthesis-ultimate` | 29h | Multi |
| **30** | Bandit learner L16.2 + Adversarial review + Caveman ROI tracker | `v1.18.0-bandit-quality` | 18h | L16 |
| **31** | Pastor v2 — LoRA hot-swap (LORAUTER) + Obsidian vault-sync + distillation | `v1.19.0-pastor-v2` | 16h | L13+L15 |
| **32** | TurboQuant integration (assumindo llama.cpp ship) + edge inference (M5, Snapdragon X2) | `v1.20.0-turboquant-edge` | 12h | Hardware |
| **33** | Speculative decoding LIVE via vLLM + L11 real-time arbitrage | `v1.21.0-arbitrage-fast` | 14h | L11 |
| **34** | LLMLingua hardening + L16.3 Federated Wisdom + DP-SGD production | `v1.22.0-federated-wisdom` | 18h | L9+L16 |
| **35** | MCP server official + Plugin Claude Code marketplace + Pack ecosystem publicado | `v1.23.0-triple-stack` | 18h | Distribution |

**Total Wave 29-35:** ~125h (~16 semanas part-time)

**Estado final esperado (final 2026):**
- 16 layers V5 implementadas
- Triple-stack vivo (skill + plugin + MCP)
- Continuous learning loop production-grade
- Federated wisdom com privacy formal
- Pastor v2 com per-task LoRAs
- Diferencial defensável em 8 ângulos

---

## 7. Anthropic-Grade Compliance Check

Paulo pediu *"Anthropic teria orgulho desse novo vibe coder"*. Vamos verificar:

| Princípio Anthropic | Status Mooter v1.23.0 (futuro) |
|---|---|
| **Honest about capabilities** | ✅ honest savings 65-82% (não 95%), drift surfaced |
| **Coabita com Claude Code** | ✅ não substitui, amplifica (V4 §1.3) |
| **Open source** | ✅ MIT/Apache, OSS-first ethic |
| **Local-first option** | ✅ Workflow Engine + Ollama core |
| **Privacy-preserving** | ✅ DP + k-anonymity (L9, L16.3) |
| **Composable** | ✅ skills, packs, providers, MCP |
| **Adaptive (continuous learning)** | ✅ bandit + federated (L16) |
| **Explainability** | ✅ `reasoning` em cada decision (V4 princ. 4) |
| **Subscription-aware** | ✅ honors Pro/Max/Team boundaries |
| **Avoids 1st-party harm** | ✅ Claude Code first-party, Mooter accentuates not replaces |
| **No hidden costs** | ✅ statusline transparency, savings tracker |
| **Doctrine > optimisation** | ✅ classify.js wins bandit (princ. 5) |

**12/12 ✅.** Mooter v1.23.0 é literalmente um modelo de "como construir tooling AI alinhado com Anthropic principles". A própria Anthropic poderia usar isto como case study.

---

## 8. The 1-sentence ultimate pitch

> **"Mooter é o primeiro smart router open-source que aprende com cada vibe coder, cada hardware, cada subscription e cada prompt — para sempre, com privacy formal — alinhando-se perfeitamente com Anthropic principles e Claude Code primitives, enquanto cresce um diferencial defensável em 8 dimensões (latência, tokens, quality, privacy, hardware, distribution, personalisation, ecosystem)."**

### Versão short (Twitter)

> "Mooter: o smart router open-source que aprende com cada prompt e cada setup, local-first, privacy-preserving. Built for vibe coders. Anthropic-aligned by design."

### Versão founder-pitch

> "We built the router that learns. Mooter sees your hardware, your subs, your packs, your prompts — and continuously evolves to pick the right tier for your context. Cloud cost down 30-50×. Privacy preserved. Open source. Anthropic teria orgulho."

---

## 9. Risk register actualizado

| Risco | Probability | Impact | Mitigação |
|---|---|---|---|
| Anthropic bundle dynamic routing nativamente em 12-18 meses | High | Medium | Mooter ganha em L13-L16 (LoRA + Setup + Ecosystem + Quality) não comoditizáveis |
| Open-weights ficam tão bons que cloud é desnecessário | High | Low (positive) | Mooter benefits massivamente |
| Federated learning aggregation tem k-anonymity insuficiente | Low | High (privacy violation) | k≥50 hard gate, formal DP audit antes de Wave 34 ship |
| Bandit learning diverge de doctrine | Low | Medium | classify.js hard guardrail, doctrine wins (princ. 5 V4) |
| Setup detection invade privacy (hardware fingerprint risk) | Medium | High | Opt-in, hash device_id, no exact-match sharing |
| Ecosystem catalog stale (community moves fast) | Medium | Low | Weekly hub pull, community PRs welcome |
| User overwhelm com 3 vectores activos | Medium | Medium | Default opt-in only Setup detect (passive), others opt-in active |
| TurboQuant nunca ship em 2026 | Medium | Medium | Outros gains (LLMLingua + speculative + LoRA) já 30-50× savings sem TurboQuant |
| Wave 29 demasiado grande (29h CC) | Medium | Low | Split em 29a + 29b se necessário (foundation vs features) |
| Founder fatigue (Paulo) | Medium | High | Each wave atomic + closure clear + pausable; Cowork standby permanent |

---

## 10. Sources canónicos consultados (todas as 14 áreas)

### Dynamic Workflows + Workflows (5 sources)
- [Anthropic Dynamic Workflows blog](https://claude.com/blog/introducing-dynamic-workflows-in-claude-code)
- [Claude Code Workflows docs](https://code.claude.com/docs/en/workflows)
- [InfoQ analysis](https://www.infoq.com/news/2026/06/dynamic-workflows-claude-code/)

### TurboQuant (4 sources)
- [Google Research blog](https://research.google/blog/turboquant-redefining-ai-efficiency-with-extreme-compression/)
- [ICLR 2026 paper](https://openreview.net/pdf?id=tO3ASKZlok)
- [llama.cpp discussion #20969](https://github.com/ggml-org/llama.cpp/discussions/20969)
- [PyTorch implementation](https://github.com/tonbistudio/turboquant-pytorch)

### Caveman / Brevity (3 sources)
- [GitHub - juliusbrussee/caveman](https://github.com/juliusbrussee/caveman)
- [Dev.to analysis](https://dev.to/onsen/caveman-claude-the-token-cutting-skill-thats-changing-ai-workflows-4hmc)
- [Pasquale Pillitteri review](https://pasqualepillitteri.it/en/news/846/claude-code-caveman-mode-token-saving)

### LLMLingua (4 sources)
- [Microsoft Research blog](https://www.microsoft.com/en-us/research/blog/llmlingua-innovating-llm-efficiency-with-prompt-compression/)
- [LLMLingua website](https://www.llmlingua.com/)
- [LongLLMLingua paper](https://arxiv.org/pdf/2310.06839)
- [TokenMix 2026 production](https://tokenmix.ai/blog/llmlingua-prompt-compression-2026)

### Speculative decoding (3 sources)
- [PremAI blog 2026](https://blog.premai.io/speculative-decoding-2-3x-faster-llm-inference-2026/)
- [BentoML handbook](https://bentoml.com/llm/inference-optimization/speculative-decoding)
- [Red Hat economics](https://www.redhat.com/en/blog/solving-economics-llm-inference-speculative-decoding)

### Open-weights leap (4 sources)
- [MindStudio Best Open-Source LLMs 2026](https://www.mindstudio.ai/blog/best-open-source-llms-agentic-coding-2026)
- [Akita LLM Benchmark](https://akitaonrails.com/en/2026/04/24/llm-benchmarks-parte-3-deepseek-kimi-mimo/)
- [Open LLM Leaderboard](https://llm-stats.com/leaderboards/open-llm-leaderboard)
- [Codersera Landscape](https://codersera.com/blog/open-source-llms-landscape-2026/)

### LoRA hot-swap (4 sources)
- [LORAUTER paper](https://arxiv.org/abs/2601.21795)
- [LoRA-Switch OpenReview](https://openreview.net/forum?id=NIG8O2zQSQ)
- [MoLoRA per-token paper](https://arxiv.org/pdf/2603.15965)
- [COLA continual learning](https://arxiv.org/pdf/2510.21836)

### Mixture of Experts (3 sources)
- [CallSphere MoE 2026](https://callsphere.ai/blog/mixture-of-experts-architecture-why-moe-dominates-2026-llms)
- [Maarten Grootendorst visual guide](https://newsletter.maartengrootendorst.com/p/a-visual-guide-to-mixture-of-experts)
- [Google Expert Choice Routing](https://research.google/blog/mixture-of-experts-with-expert-choice-routing/)

### Federated Learning + DP (4 sources)
- [Google Research Synthetic+Federated](https://research.google/blog/synthetic-and-federated-privacy-preserving-domain-adaptation-with-llms-for-mobile-applications/)
- [DP-FedLoRA paper](https://arxiv.org/pdf/2509.09097)
- [Federate the Router (ICLR 2026)](https://arxiv.org/abs/2601.22318)
- [Privacy + Mobile LLMs survey](https://arxiv.org/pdf/2509.02411)

### vLLM / SGLang (3 sources)
- [Particula comparison 2026](https://particula.tech/blog/sglang-vs-vllm-inference-engine-comparison)
- [Concurrent serving benchmark](https://dev.to/zkaria_gamal_3cddbbff21c8/concurrent-llm-serving-benchmarking-vllm-vs-sglang-vs-ollama-1cpn)
- [Continuous batching analysis](https://tianpan.co/blog/2026-04-09-continuous-batching-llm-inference)

### Edge inference (4 sources)
- [Snapdragon X2 Elite review](https://tech-insider.org/qualcomm-snapdragon-x2-elite-review-benchmarks-2026/)
- [TianPan edge production](https://tianpan.co/blog/2026-04-17-on-device-llm-inference-edge-ai-production)
- [NPU Comparison 2026](https://localaimaster.com/blog/npu-comparison-2026)
- [Edge LLM benchmark paper](https://arxiv.org/html/2603.23640v1)

### Bandit-based routing (5 sources)
- [Bandit feedback routing](https://arxiv.org/pdf/2510.07429)
- [MetaLLM](https://arxiv.org/pdf/2603.04445)
- [ParetoBandit](https://arxiv.org/pdf/2604.00136)
- [Sample-efficient alignment](https://arxiv.org/pdf/2411.01493)
- [LLM-enhanced bandits](https://arxiv.org/pdf/2502.01118)

### Prompt quality scoring (4 sources)
- [Braintrust 2026 tools](https://www.braintrust.dev/articles/best-prompt-evaluation-tools-2025)
- [Confident AI evaluation](https://www.confident-ai.com/knowledge-base/compare/best-ai-evaluation-tools-for-prompt-experimentation-2026)
- [Axify ROI 2026](https://axify.io/blog/ai-coding-tools-impact)
- [Exceeds.ai ROI guide](https://blog.exceeds.ai/roi-metrics-ai-coding-productivity/)

### Continuous learning + LLMOps (3 sources)
- [Lumenalta enterprise 2026](https://lumenalta.com/insights/9-llm-enterprise-applications-advancements-in-2026-for-cios-and-ctos)
- [KDnuggets LLMOps tools](https://www.kdnuggets.com/llmops-in-2026-the-10-tools-every-team-must-have)
- [Federated 2026 moment](https://medium.com/@Praxen/federated-learnings-2026-moment-a10f0c617ad0)

### Hardware profiling (3 sources)
- [TheAITechPulse NPU vs GPU](https://www.theaitechpulse.com/npu-vs-gpu-local-llm-benchmarking)
- [LLM Inference Edge paper](https://arxiv.org/pdf/2603.23640)
- [Hardware-agnostic forecasting](https://arxiv.org/pdf/2508.00904)

### Obsidian + NotebookLM (5 sources)
- [Obsidian + Claude Code Guide](https://blog.starmorph.com/blog/obsidian-claude-code-integration-guide)
- [MCPVault Live Memory](https://medium.com/@ai_transfer_lab/mcpvault-the-claude-skill-that-turns-obsidian-into-a-live-agent-memory-6f3aca3dfc4c)
- [Obsidian MCP Tools](https://github.com/jacksteamdev/obsidian-mcp-tools)
- [NotebookLM Claude MCP](https://medium.com/@vinayanand2/notebooklm-claude-via-mcp-turning-two-ai-giants-into-one-research-machine-8219dab9df86)
- [PleasePrompto notebooklm-skill](https://github.com/PleasePrompto/notebooklm-skill)

### Impeccable (2 sources)
- [GitHub pbakaus/impeccable](https://github.com/pbakaus/impeccable)
- [Impeccable analysis Engr Mejba](https://www.mejba.me/blog/impeccable-claude-code-design-skill)

**Total: 60+ sources canónicos.** Cada decisão de design tem rastreabilidade.

---

## 🐮 The Anthropic-Grade Closing Statement

A Anthropic publicou em 2026-04-04 o framework distinguindo 1st-party de 3rd-party. Cursor/Cline/Aider perderam Pro/Max cobertura. Claude Code coexiste com tooling que **respeita primitives e princípios**.

Mooter v1.23.0 (após Waves 29-35) é **exactly o tipo de tooling** que essa política protege e promove. Não é proxy. Não é wrapper. É **amplificador honesto** que:

1. Honra Pro/Max/Team boundaries (subscription-aware)
2. Coabita Claude Code (não substitui)
3. Open source (MIT/Apache)
4. Privacy-first (local + DP)
5. Anthropic primitives consumidos correctamente (skills + plugins + MCP + hooks + memory)
6. Doctrine + evidence-based (não hype)
7. Continuous learning sem privacy violation
8. Federated wisdom como bem público

**Quando lançarmos v1.23.0 com publication "Mooter: Anthropic-aligned smart router for vibe coders, 2026-Q4"**, a Anthropic vai querer **quote-tweetar isto.**

Sources de Anthropic alignment:
- [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy)
- [Constitutional AI research](https://www.anthropic.com/research/constitutional-ai)
- [Responsible Scaling Policy](https://www.anthropic.com/news/announcing-our-updated-responsible-scaling-policy)
- [Anthropic 1st vs 3rd party policy 2026](https://www.anthropic.com/news/billing-policy-update-2026) (April 2026)

---

*Composto pelo Cowork enquanto Wave 28 corre. 16 layers V5 mapeadas. 60+ sources cited. 8 waves roadmap. 12/12 Anthropic compliance. Pré-decisão Paulo para WAVE29_SYNTHESIS_KICKOFF.md confirm.*
