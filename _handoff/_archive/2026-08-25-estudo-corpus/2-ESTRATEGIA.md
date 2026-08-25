# ESTRATEGIA (concat, 2026-08-25)
===== docs/strategy/PASTOR.md =====
# Mooter v2 — Pastor Alemão (Skill-Pack Router)

> **Documento canónico** do segundo eixo de routing do Mooter. Companhia a `STRATEGY.md` (visão), `ROUTING.md` (eixo complexidade T0–T3), `MASTER_PROMPT.md` (Phases 0–14 do V3). **Não substitui** nenhum — adiciona o eixo *domínio → Moo Pack*.
>
> **Criado**: 2026-05-27 · **Autor**: Paulo Loureiro · **Owner**: Paulo · **Status**: 🟡 proposta, pronta a executar (Wave 1 = 7 dias)
>
> Research factual de suporte: [`research_best_in_class_2026.md`](./research_best_in_class_2026.md) (14 domínios, Maio 2026, fontes citadas).

---

## TL;DR

O Mooter v1 rotea **modelos** por complexidade (T0–T3). O Mooter v2 — Pastor Alemão — rotea **rebanhos** (Moo Packs) por intenção de domínio, escolhendo simultaneamente o modelo *e* o conjunto óptimo de skills, MCPs, sub-agentes, repos canónicos e prompt scaffolds. O modelo deixa de ser o output principal do classificador e passa a ser **uma das vaquinhas do rebanho**.

A tese cabe numa frase:

> *"O único router que escolhe o modelo certo, as ferramentas certas e os exemplos certos — antes de escrever um único token."*

Esta wave é **backward-compatible** com tudo o que já existe (`classify.js`, hooks, subagents, frugal-hub). Adiciona um classificador de domínio (camada regex → embedding → Haiku fallback) e um Pack Registry local + sindicado.

---

## 1. Tese

| Dimensão | v1 (existe) | v2 Pastor (esta wave) | v2.1 Pastor + Adapter Forge (Wave 5) |
|---|---|---|---|
| Eixo de routing | Complexidade | Complexidade **+** domínio | Complexidade + domínio **+ especialização** |
| Output do classifier | Tier T0–T3 | Tier + Pack ID | Tier + Pack ID + Adapter ID |
| Decisão sobre tools | Estática | Dinâmica (Pack diz quais) | Idem v2 |
| Decisão sobre skills | Manual | Pack invoca skills | Idem v2 |
| Decisão sobre MCPs | Tudo ligado sempre | Pack recomenda só necessários | Idem v2 |
| Decisão sobre pesos | Modelo base sempre | Modelo base sempre | **Adapter LoRA local quando disponível e validado em eval** |
| Onboarding de tools novos | User descobre manualmente | Pastor sugere instalar | Idem v2 + sugere treino de Project LoRA após N decisões |
| Diferencial competitivo | Router de modelo (saturado) | **Curador automático de stacks** (vazio) | **Switching cost biológico — adapter aprende o teu projecto** |

**Porquê agora**: a research 2026-05-27 confirma três coisas que abrem a janela:

1. Anthropic Skills tem **17 skills oficiais** mas a comunidade já produziu **>66 000** — não há *Skills Registry* canónico. ([SkillsMP](https://skillsmp.com/), [claudemarketplaces.com](https://claudemarketplaces.com/))
2. MCP Registry oficial Anthropic cobre **~20% dos servers existentes** — há 10k+ em PulseMCP/Smithery sem signal de qualidade unificado.
3. Frameworks de orquestração consolidaram para 6 dominantes (Claude Agent SDK, Strands, LangGraph, OpenAI Agents SDK, CrewAI, AG2) — espaço para um **router agnóstico** que escolhe *qual* usar por intenção, não que os substitui.

A research mostra ainda que **Smithery + Composio + PulseMCP estão a evoluir de catálogos para semi-routers** (one-click install, hosted runtime). Se algum deles adicionar classificação por intent, são competidor directo. Janela estimada: **<12 meses**.

---

## 2. Estado actual (auditado 2026-05-27)

Já existe no `~/frugal/`:

| Componente | Path | Estado | Reaproveita-se no Pastor? |
|---|---|---|---|
| `classify.js` (complexity router) | `tools/router/classify.js` | ✅ produção, v3 fast-paths + cache | ✅ sim — eixo 1 mantém-se |
| `inject_context.js` (hook) | `tools/router/inject_context.js` | ✅ produção | ✅ sim — passa a emitir `<pack-hint>` |
| `patterns.js` (risk/intent patterns) | `tools/router/patterns.js` | ✅ produção | ✅ extende-se com domain signals |
| 6 subagents | `agents/*.md` | ✅ produção | ✅ continuam — Packs invocam-nos |
| `frugal-hub` (Cloudflare Workers) | `frugal-hub.workers.dev` | ✅ live (D1 + R2 + trust_score) | ✅ sindica Pack Registry |
| `signals.js`, `similarity.js` | `tools/router/` | ✅ produção | ✅ ferramentas para domain classifier |
| `~/frugal/packs/` | — | ❌ não existe | 🔜 criar |
| `pack.schema.yaml` | — | ❌ não existe | 🔜 criar Dia 1 |
| `classify_domain()` | — | ❌ não existe | 🔜 criar Dia 3 |
| `<pack-hint>` no contexto | — | ❌ não existe | 🔜 criar Dia 4 |

Skills/MCPs activos *nesta máquina* (snapshot do system reminder, 2026-05-27):
- 47 skills disponíveis via Skill tool (Anthropic core + design + product-management + outras)
- ~20 MCP servers ligados (Canva, Gmail, Microsoft Docs, Notion, Spotify, Box, Linear, Calendar, Context7, Vercel, Figma, Supabase, Atlassian, Intercom, Slack, Asana, etc.)
- Plugin marketplace (`mcp__plugins__*`) + MCP Registry (`mcp__mcp-registry__*`)

**Conclusão**: a base existe. Pastor é **uma camada adicional**, não um rewrite.

---

## 3. Two-Axis Routing

```
UserPromptSubmit "preciso de animar este hero section"
   │
   ├─► classify_complexity()    ──► T2 (Sonnet) ◄── EIXO 1 (já existe)
   │
   └─► classify_domain()        ──► pack="animation-web" ◄── EIXO 2 (NOVO)
        ├─ regex layer     (0 cost, <5ms, fast-path)
        ├─ embedding layer (50ms, opcional)
        └─ Haiku fallback  (se confidence < 0.6, ~$0.0005)
                │
                ▼
        pack_resolve()
          ├─ skills disponíveis vs requeridas
          ├─ MCPs ligados vs recomendados
          └─ gaps → suggest install
                │
                ▼
        emit <router-hint> + <pack-hint>
```

Os dois eixos são **ortogonais e independentes**:
- "Faz uma animação trivial em CSS" → T1 + `animation-web`
- "Faz uma animação complexa com timeline GSAP + scroll trigger" → T3 + `animation-web`
- "Resume este log de erros" → T0 + `code-debug`
- "Audita arquitectura deste repo" → T3 + `code-audit`

O `classify.js` v1 nunca conheceu `animation-web`. Por isso falha o caso 1 (over-routes para T0 por falta de coding signals) e o caso 4 (não distingue audit de coding). **Pastor resolve isto.**

---

## 4. Anatomia de um Moo Pack

Um pack é um ficheiro declarativo YAML em `~/frugal/packs/<name>/pack.yaml`. Sem código. Manifesto + scaffolds.

### Schema (`packs/pack.schema.yaml`)

```yaml
# Schema canónico — todos os packs devem validar contra isto
name: string                          # kebab-case, unique
version: semver                       # 0.1.0+
description: string                   # ≤ 100 chars
domain_signals:
  keywords: [string]                  # match exact-word (boundaries)
  intent_phrases: [string]            # match substring (lower-case)
  file_extensions: [string]           # signal opcional, boost score
  negative_keywords: [string]         # match → reject pack
model_floor: T0|T1|T2|T3              # tier mínimo recomendado
model_ceiling: T0|T1|T2|T3            # tier máximo (cost guard)
skills:
  required: [string]                  # Skill names (Anthropic registry)
  recommended: [string]
mcps:
  required: [string]                  # MCP server identifiers
  recommended: [string]
subagents:
  primary: string                     # agent name de ~/frugal/agents/
  reviewer: string                    # opcional, para gate final
repos_canonical:                      # repos de referência conhecidos
  - { name: string, url: string, license: string, note: string }
tools_cli: [string]                   # CLI tools (npx, pipx, brew)
prompt_scaffold: string               # system prompt especializado, multiline
validation:
  smoke_test: string                  # frase descritiva do teste
  acceptance_criteria: [string]
metadata:
  author: string
  created: ISO8601
  validated_against:                  # snapshot de skills/MCPs no momento de validação
    skills_version: string
    mcp_registry_snapshot: ISO8601
  ttl_days: integer                   # após este prazo, requer re-validação
  trust_score: float                  # 0–1, calculado pelo hub (default 0.5)
  usage_count: integer                # quantas vezes activado (telemetria opt-in)
```

### Resolução em runtime

```
1. classify_domain(prompt) → pack_id, confidence
2. pack_resolve(pack_id):
   a. load packs/<pack_id>/pack.yaml
   b. check ttl_days expirou? → re-validar contra registries
   c. for skill in required: verifica disponibilidade no Skill tool
   d. for mcp in required: verifica server ligado
   e. produce: { available_skills, available_mcps, missing, suggest_install_cmd }
3. emit <pack-hint> com tudo o acima
4. Claude lê hint e age:
   - se ! missing: invoca skills, usa MCPs, segue scaffold
   - se missing: pede confirmação ao user para instalar ou prosseguir sem
```

---

## 5. Os 7 Packs Sementinha

Cobertura: **~80% dos pedidos de um vibe coder solo** (validado contra a research). Cada um cita fontes da [research 2026-05-27](./research_best_in_class_2026.md).

### 5.1 `animation-web` 🔥

```yaml
name: animation-web
version: 0.1.0
description: Web animations (React, CSS, scroll-triggered, motion graphics)
domain_signals:
  keywords: [animation, animar, animate, motion, transition, transição, scroll-trigger, lottie, parallax, easing, keyframe]
  intent_phrases: ["fazer animar", "transição suave", "scroll driven", "hero animation", "micro-interaction"]
  file_extensions: [.tsx, .jsx, .css, .svg, .json]
  negative_keywords: [server animation, gif compression]
model_floor: T2
model_ceiling: T3
skills:
  required: [anthropic-skills:web-artifacts-builder]
  recommended: [anthropic-skills:algorithmic-art]
mcps:
  recommended: [vercel]
subagents:
  primary: model-reasoner
  reviewer: final-reviewer        # só se for hero do site
repos_canonical:
  - { name: motion, url: https://motion.dev, license: MIT, note: "Default React 2026 — sponsors top-tier" }
  - { name: gsap, url: https://gsap.com, license: "Proprietary free (Webflow)", note: "Imperativo, melhor para timelines complexos; restrição anti-Webflow-competitor" }
  - { name: tailwindcss-motion, url: https://github.com/romboHQ/tailwindcss-motion, license: MIT, note: "5KB CSS-only, simple cases" }
  - { name: theatre-js, url: https://www.theatrejs.com/, license: Apache-2.0, note: "Editor visual para sequências 3D/2D" }
tools_cli: []
prompt_scaffold: |
  Tu és um animation engineer. Prioridades, por esta ordem:
  1. CSS scroll-driven nativo quando suficiente (View Transitions, animation-timeline)
  2. Motion (motion.dev) para React quando precisas de declarative state-driven
  3. GSAP só quando timeline complexo / sequencing imperativo (atenção à licença Webflow)
  4. Tailwindcss-motion para casos triviais (5KB CSS)
  60fps non-negotiable. Mede com Chrome DevTools Performance se houver dúvida.
  Respeita `prefers-reduced-motion` SEMPRE — adiciona o media query, não negociável.
  Sem `animation: none !important` global hacks.
validation:
  smoke_test: "Verifica prefers-reduced-motion honrado; verifica que não há layout thrashing (only transform/opacity)"
  acceptance_criteria:
    - "Animação 60fps medida em DevTools"
    - "prefers-reduced-motion respeitado"
    - "Bundle delta ≤ 40KB se não estava previamente"
metadata:
  author: paulo-loureiro
  created: 2026-05-27
  validated_against:
    skills_version: "2026-05"
    mcp_registry_snapshot: 2026-05-27
  ttl_days: 90
  trust_score: 0.5
===== docs/strategy/MOOTER_ULTIMATE_VISION.md =====
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

===== /sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/40-strategy/pitch-90s.md =====
---
type: strategy-pitch
created: 2026-04-25
purpose: Pitch reutilizável quando alguém perguntar "no que estás a trabalhar?"
tags: [strategy, pitch, communication]
---

# Pitch de 90 segundos

> Versão genérica. Adaptar tom (founder/dev/recruiter/family) conforme contexto.

## Versão "founder a outro founder"

> "Estou em sabbatical técnica desde Março. Vendi a minha empresa anterior à B3, comprei tempo, e meti-me a aprender engenharia de software a sério usando AI como multiplicador.
>
> Nos últimos 60 dias construí 4 produtos em produção: um CRM imobiliário enterprise para o mercado SP de imóveis premium (330h, 106k linhas de código, em [marleyliving.com](https://marleyliving.com)), um router open-source que decide entre Claude e modelos locais para poupar 90% em fatura de AI ([mooter.ai](https://mooter.ai)), e um par de assistentes domésticos privacy-first para PC e qualquer speaker BT/WiFi.
>
> A tese é simples: a próxima geração de software é construída por humanos com julgamento de domínio profundo, multiplicados por AI, em hardware local potente. Estou a provar a tese e a escolher agora qual destes 4 aprofundar nos próximos 6 meses."

## Versão "dev a outro dev"

> "Em sabbatical, a aprender engenharia a sério. Construí 4 coisas em paralelo nos últimos 2 meses:
>
> - **Mooter** — model router open-source, hook 113ms, 90.2% accuracy num dataset de 1370 prompts, decide entre Ollama local e Claude/GPT/Gemini. Open beta agora.
> - **Cloude Home** — Electron + Node, voice pipeline E2E (wake word → VAD com histerese → Whisper local → Claude tool-use → Cartesia TTS), Neural Vault Obsidian-style com graph-aware RAG, 160 testes verdes.
> - **Cloude Speaker** — Next.js webapp que liga a qualquer speaker BT/WiFi, hardware intelligence (deteta mic integrado via groupId), wake word "Claude" no browser.
> - **Marley Living** — CRM enterprise com 40 Edge Functions, 223 RLS policies, 16 integrações (incluindo WAHA self-hosted para WhatsApp).
>
> Stack default: Next.js + TypeScript + Supabase + Vercel. Hardware: PC Windows + RTX 4090 24/7. Trabalho com Claude Code (Opus 4.7) + Cowork para planeamento. Tudo em [GitHub](https://github.com/pauloloureiroshp-ship-it)."

## Versão "recruiter / hiring manager"

> "Founder com exit prévio (a empresa anterior foi para a B3, a Bolsa de Valores do Brasil). Background em Comercial, Operações, Jurídico e Compliance — não em tecnologia. Em Março 2026 comecei a aprender engenharia a sério usando AI como multiplicador.
>
> Em 60 dias construí 4 produtos em produção. O mais relevante para um portfolio técnico é o Cloude Home — um assistente doméstico AI privacy-first com voice pipeline completo, Neural Vault tipo Obsidian com graph-aware RAG, builds para Windows e macOS via GitHub Actions, 160 testes unitários, multi-turn voice regression harness. Tudo solo, em ~2 semanas de focus dedicado.
>
> Documentei tudo num portfolio público — 8 páginas que cobrem arquitectura, decisões técnicas, métricas, custos, aprendizados e session-by-session timeline. É literalmente o meu MBA prático de engenharia."

## Versão "investidor"

> "Tese: a próxima geração de software é construída por humanos com julgamento de domínio profundo, multiplicados por AI, com hardware local potente a tornar custo marginal próximo de zero.
>
> Provei a tese: solo, em 20 dias, construí um CRM enterprise (Marley Living) que custaria $200-420k e 6 meses a uma equipa tradicional. Custo real: $2.500. Redução: 160-200×.
>
> Estou agora a escolher onde aplicar a tese a um mercado mais escalável que CRM B2B de nicho. As candidatas são: model router open-source (mercado: todos os devs com Claude/GPT), assistente doméstico AI privacy-first (mercado: 60% dos utilizadores insatisfeitos com Alexa/Google Home), webapp consumer (mercado: mainstream que não quer instalar nada).
>
> O que procuro: feedback estratégico sobre qual mercado tem janela mais curta para entrar, e potencialmente capital para acelerar."

## Versão "família/amigos não técnicos"

> "Saí da empresa anterior depois de a vender a uma grande organização. Em vez de descansar, pus-me a aprender programação a sério, com ajuda de inteligência artificial — basicamente, um colega de trabalho que sabe tudo de código, com quem eu trabalho dia e noite.
>
> Em 2 meses construí 4 produtos. Um CRM para corretores de imóveis caros em São Paulo. Um sistema que torna a inteligência artificial 10× mais barata. E dois assistentes para casa, no estilo Alexa/Google Home, mas privados, mais inteligentes, e que correm no nosso PC sem mandar dados para fora.
>
> Tudo isto sozinho, em casa. Estou agora a decidir em qual destes me concentro nos próximos 6 meses, para o transformar num negócio sério."

## Notas de uso

- **Adapta números** quando atualizares (805 prompts, 90.2%, 330h, etc.)
- **Inclui sempre 1 link** que a pessoa possa abrir agora (LinkedIn, GitHub, ou produto)
- **Pratica em voz alta** — 90 segundos é mais curto do que parece quando há entusiasmo
- **Termina com pergunta** quando possível ("o que vês como o maior risco da minha tese?", "conheces alguém que esteja neste mercado?")

Ver também: [[00-core/quem-sou]] · [[40-strategy/decision-framework]]
===== /sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/40-strategy/2026-08-25-pitch-registro-metricas-medidas.md =====
---
type: strategy-pitch-registro
created: 2026-08-25
purpose: Fonte ÚNICA de números para o pitch deck do Mooter/Moo Pilot. Só entra número MEDIDO com fonte. Positivos E negativos — a honestidade é o produto. Atualizado por rotina semanal (segunda 09:00 BRT, sessão Cowork agendada) + delta manual em marcos.
regra: decisão 2026-08-24 — NENHUM valor de poupança publicado sem tokens medidos. O $ abaixo é yardstick de preço de lista, não poupança.
---

# Registro de métricas para o pitch — Moo Pilot / Mooter

## Snapshot 2026-08-25 (medido 11:00–12:15Z, fontes: beacons assinados, painel :4290, journals, decisões)

### Confiabilidade (o que o investidor compra)
| Métrica | Valor | Fonte |
|---|---|---|
| Suite de testes | **760 pass · 0 fail** (`npm run test:cockpit-runner`, = comando do CI) | journal gate-L0 25/08 |
| Rondas adversariais absorvidas | **6** (codex só-leitura + kimi), **35 defeitos → 34 confirmados por medição, 1 refutado** | journal gate-L0 |
| PRs do ciclo gate-L0 | #361→#371 (11 PRs em ~36h, main `0e4f4047`+) | git |
| Frota autenticada | 2/2 devices **Ed25519-v1**, `prova_frota: true`, `rejeitados: []` | 50-fleet/trusted-devices.json + fleet.json |
| Integridade | `classify.js` FROZEN, sha CI-enforced `427d8c0b…` intacto | fleet.json projeto |
| Honestidade estrutural | poupança REMOVIDA de todas as superfícies até haver tokens medidos (v1.49.4, PRs #346/#350) · spoof do dono CONTADO em vez de fingido-fechado | 20-decisions 24/08 · PR #366 |

### Trabalho da GPU a custo marginal $0
| Métrica | Mac mini | Windows RTX 4090 |
|---|---|---|
| Rondas na janela (5000 recibos) | 4929+ · cited 2319 · refutado 73 (1,5% < barra 2% → L1 aberto) | cited 2550 · refutado 11 |
| Autopilot | **L1 ativo** (dreno auditado, 25/tique, reserva 1-em-20) | **L1 ativo** |
| Yardstick de preço de lista | **US$ 38,13 em 7 dias** de tokens equivalentes · **US$ 0 gastos pelo loop** | idem, por device |

### Negativos declarados (o slide que nos torna credíveis)
| Métrica | Valor | Leitura |
|---|---|---|
| **Keep-rate do dono** | **2 mantidos / 44 decisões (4,5%)** — Mac 2/24 · PC 0/20 | o instrumento (P2/P3) faz perguntas fracas; decisão 25/08 "20 achados, 0 valiam" assinada. **Correção = redesenho das perguntas, não mais GPU** |
| Pilares P7–P10 | 0 cited em ~2000 rondas | fatias pequenas demais — próxima medição, não conclusão |
| Recidivas da mesma classe | 4× "duas contagens, janelas diferentes" em 4 rondas | processo corrige instância, não classe — item nº1 do masterprompt |
| Frota | Jetson fora (0/1), MacBook fora | 2/4 devices |
| O par do portão 2 (guardar para o deck) | *"you keep 0%"* — às 05:00 era **falso** (531 decisões de scripts); à noite era **verdadeiro** (20 decisões do dono) | "o mesmo output, uma vez falso e uma vez verdadeiro — a diferença é quem o produziu" |

### ⚠️ Contradição a corrigir
`40-strategy/pitch-90s.md` (25/04) ainda diz "poupar **90%** em fatura de AI" — viola a decisão de 24/08. Atualizar o pitch-90s para a linguagem yardstick + honestidade instrumentada.

## Como esta página cresce
Rotina semanal (segunda 09:00 BRT, sessão agendada com acesso ao vault) appenda `## Delta <data>`: testes (nº e falhas), refutado%, keep-rate do dono acumulado, PRs merged, devices assinados, incidentes/regressões, e 1 história medida da semana. Regra: negativo entra com a mesma tipografia do positivo.
===== /sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/00-core/mooter-constituicao.md =====
---
type: core
project: core
status: living
created: 2026-07-24
updated: 2026-07-24
lang: pt-BR
source: paulo
---

# Mooter — Constituição: uma empresa de um só CEO

> Filosofia-raiz (Paulo, ex-Shipay): **"Confia mais e controla menos."** Não é liberar tudo. É contratar bem (conhecemos a procedência de cada LLM), dar autonomia por papel, e deixar os **guardrails mecânicos** segurarem — para o CEO tocar uma empresa enorme **sozinho**, sem loops de perguntas.

## O organograma
| Papel | Agente | Autonomia | Guardrail que segura |
|---|---|---|---|
| **CEO** | Humano (Paulo) | Total. Define intenção e autoridade. **Não** micro-aprova nem serve de barramento de mensagens | — |
| **Chief of Staff / COO** | Maestro (Cowork · Fable 5) | Orquestra, decide, escreve doutrina, consolida | 1 por wave; escreve estado só via ledger |
| **Engenheiros séniores** | Solistas (Claude Code · Codex · Gemini) | Executam em worktree isolado; edições livres | gate só no irreversível; nunca no vault-tree; sandbox/approval por config |
| **Analistas Jr / operações** | Atalaia (local moos, Ollama) | Tarefas frias $0 (classify, embed, triage) | sem mãos — acesso só via router; bwrap; classify.js FROZEN escolhe o modelo |

## Os 5 princípios invioláveis
1. **A classe da ação vem do mecanismo, nunca do juízo do LLM.** Reversível→autónomo · reversível-partilhado→autónomo-com-guardrail · irreversível/externo→gate · keys/sudo/self-config→proibido a todos.
2. **Comunicação assíncrona, não perguntas síncronas.** Handoffs e estado vivem no **ledger append-only** + blocos **⇄** validados por `handoff-guard.js`. Nenhum agente pergunta a outro em tempo real; lê o ledger. O CEO não é o meio de comunicação.
3. **Um só escritor do estado partilhado** (o Maestro/ledgerd). Solistas devolvem output; nunca escrevem o estado que os outros leem (anti-envenenamento, ASI06).
4. **Gate raro = gate real.** Um gate que dispara >3x/dia está mal desenhado e vira teatro (o CEO carimba no automático). Medir gates/dia no ledger; se sobe, a ação devia ser autónoma-com-guardrail.
5. **As configs de permissão são invioláveis.** Nenhum agente edita as próprias regras (`settings.json`, `config.toml`, policies, esta constituição). Deny explícito.

## Como se chega ao "prompt perfeito" por agente
Cada papel é mapeado → organizado → checado (handoff-guard/gitleaks) → confrontado (dry-test/red-team) → validado (evidência real, não prosa) → com as perguntas certas ([[reasoning-protocol]] auto-interrogação) → até ao **masterprompt de setup** que o põe no nível certo. Ver: `BLUEPRINT_autorizacao_familia_mooter.md`.

## North-star
**Um utilizador criativo toca uma empresa enorme sozinho** — subscription + local — com acesso total e segurança, sem turnos de perguntas entre todos.

## Loopholes que têm de ficar fechados para isto ser real (não aspiracional)
- ⚠️ O ledger assíncrono **tem de existir** (hoje é desenho) — senão os loops de pergunta voltam.
- ⚠️ Segurança-primeiro: nenhuma autonomia nova com as 3 keys ainda pushed.
- ⚠️ Guardrails mecânicos por agente **configurados** (masterprompts D1–D4), não só documentados.
- ⚠️ Kill-switch (`panic.bat`) a funcionar: o CEO recupera o controlo em <30s.

> Relacionados: [[curador]] · [[paulo-model]] · [[reasoning-protocol]] · [[handoff-canonico]] · [[protocolo-comunicacao]].
===== /sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/00-core/como-trabalhamos.md =====
---
type: core-protocol
created: 2026-07-17
updated: 2026-07-17
purpose: O manual de operação em UMA página — como Paulo + Cowork + CC + Codex + moos trabalham juntos sem perder nada. Só ponteiros; as fontes mandam.
tags: [core, operacao, board, handoff, despacho]
---

# Como trabalhamos (o manual de 1 página)

## O ritual do BOARD (a pergunta "onde está tudo?" tem 1 comando)
- **Paulo → Cowork:** dizer **"board"** → Cowork gera a tabela completa confrontando
  mount + GitHub + handoffs: PRs por mergear · worktrees ativas vs fósseis · sessões
  abertas e EM RISCO (uncommitted/unpushed) · próximos gates humanos · quem espera quem.
- **Agente → repo:** `npm run handoff:preflight` (BOARD mecânico worktree-true, PR #254) +
  ler `_handoff/agent-sync/latest.md` ANTES de agir (AGENTS.md já manda).
- SYNC.md = projeção do reducer (F1), nunca editado à mão; stale = flag do projection-drift.

## Quem manda resultado → formato HANDOFF (canon #255, sem exceção)
Front-matter YAML (type/id/from/to/status/state/worktree/branch/sha/uncommitted/tests/
decisions_pending) + corpo Cowork-perfect + rodapés `CCA: n/5` e `🔍 council 8/8`.
Uncommitted = RED ALERT com paths. Incerto = n/d, nunca palpite. Budget ≤4k tokens.

## Quem gera MASTERPROMPT → contexto geral + can/cannot obrigatórios
Template canônico (#255): 🎯 GOAL · 📍 WHERE (worktree/branch/base) · 🔒 GUARD (frozen,
allowlist EXATA, o que NUNCA tocar) · ✅ GATE (provas mecânicas) · ⛔ STOPs · ♻️ REUSE
respondido · budget ≤8k. Masterprompt sem allowlist ou sem STOPs = devolver, não executar.

## Despacho de paste (regra 📮)
`📮 DESTINO: <agente> · sessão <FRESCA pasta X | EXISTENTE título "Y"> · QUANDO: <AGORA |
APÓS condição verificável>`. Fresca = wave nova; existente = resposta a STOP. Sem QUANDO = agora.

## Nunca perder nada (as 5 redes de segurança, em camadas)
1. Staged/commit vivem em DISCO (reload não destrói) · 2. transcript CC recuperável
(`claude --resume` na pasta de origem) · 3. tags insurance/* antes de qualquer poda ·
4. handoff escrito ANTES de todo STOP (a memória durável da sessão) · 5. orphan-watch
(Mesh A1) alerta trabalho parado >24h. Regra: 1 wave = 1 worktree = removida no merge.

## Gates humanos (só o Paulo)
push/merge/deploy/delete/rename/pm2/schtasks · copy pública · canon/constituição ·
allowlist em packages frozen. Recomendação de agente NUNCA substitui o YES.

## Fontes (em conflito, esta ordem manda)
vault 00-core (protocolo-comunicacao · onde-vive-o-que · reasoning-protocol Axioma 4) →
repo AGENTS.md + docs/agent-context/AGENT_CONTEXT_PROTOCOL.md ("Lingua Franca v1") →
templates _handoff/templates/ → SYNC/Notion (projeções).

## BOOT GATE — check-in/check-out universal (emenda 2026-07-17, vale para TODA sessão)

Nenhuma sessão (Cowork, CC, Codex, Gemini, moo) EMITE trabalho sem os 3 passos:

1. **CHECK-IN (antes do primeiro output):** ler o estado — agente no repo: `latest.md` +
   `handoff:preflight` (BOARD) · Cowork: ritual "board" · Gemini/novos: boot §1 do teste de
   admissão. Declarar-se no Ledger: evento `session-start` com agente, ts ISO, worktree/pasta
   reclamada e intent de 1 linha. **Trabalhar em recurso já reclamado por sessão viva = STOP
   e perguntar**, nunca "dar um jeito".
2. **DURANTE:** eventos por checkpoint (o Ledger já timestampa tudo); mutação git sensível
   passa pelo conductor-guard (bloqueia, não avisa).
3. **CHECK-OUT (antes de fechar/idle):** handoff canônico escrito EM DISCO + evento
   `session-end`. Sessão que morre sem check-out = o orphan-watch acusa em <24h; o takeover
   lê o handoff e continua (provado 2026-07-17: reload do VS Code custou 5 min, não 1 dia).

O tracking de data/hora que o Paulo exige = o Ledger (ts ISO por evento) projetado no BOARD
e futuramente no Cockpit. NUNCA planilha paralela — seria a 2ª verdade.

## "Mesma língua" ≠ "mesma frase" — papel → tipo de mensagem (emenda 2026-07-17)

Sync perfeito = cada um dos 4 tipos tem UM formato canônico; o PAPEL define qual tu emites:
- **Cowork (brain):** emite MASTERPROMPT e DECISION CONTRACT. NUNCA HANDOFF.
- **CC / Codex / Gemini (executores):** emitem HANDOFF (front-matter YAML idêntico + corpo
  Cowork-perfect + rodapés CCA/council). A prosa/aprendizados vão DENTRO de campos do handoff,
  nunca no lugar da estrutura.
- **Qualquer agente → ledger:** BRIEF mínimo.

Inconsistências a eliminar (o preflight do #255 valida quando mergear): CC deve emitir HANDOFF
byte-idêntico ao do Codex; Cowork deve emitir DECISION CONTRACT sempre no mesmo template
(Decision | Verdict | change + GUARD + NEXT GATE + STOP), nunca ad-hoc. Até o #255 mergear, a
uniformidade é manual; depois é gate mecânico (`handoff:preflight --lint` rejeita fora-do-formato).

## Roteamento de masterprompt → agente de melhor-fit (canonizado 2026-07-18, com evidência)
O routing do Mooter aplicado à família: cada masterprompt vai para o agente com mais aresta na tarefa.
Baseado em comportamento OBSERVADO neste ciclo, não teoria.

| Tarefa | Melhor-fit | Sessão |
|---|---|---|
| Código preciso · segurança/concorrência · auditoria forense · allowlist rigorosa | **Codex** | existente · aba CODEX |
| Arquitetura · construir tool/harness · trabalho reflexivo | **CC** | existente/fresh · aba CLAUDE CODE |
| Review independente · validação externa · red-team · pesquisa mercado | **Gemini** (read-only+verificar) | fresh · Gemini CLI |
| Transform mecânico $0 (digest/index/draft/compressão) | **moo local** | fleet |
| Design · decisão · estratégia · arbitragem · orquestração | **Cowork** | — |

3 regras (o fit é aresta, não lei): (1) vantagem marginal, não exclusividade — roteia por quem tem a
aresta E está livre; (2) **autor nunca revê o próprio trabalho** — o que um Claude escreveu, outro
modelo confere (Gemini); (3) irreversível alto-risco → o mais rigoroso (Codex + final-reviewer + gate
Paulo). O cabeçalho 📮 de despacho ganha a linha **FIT: <porquê este agente>** (transparência auditável).

### Emenda 2026-07-18 — FIT inclui ACESSO, não só especialidade
Lição do kickoff Gemini: fit = especialidade × ACESSO/ferramentas. O Gemini (Code Assist/CLI atual)
tem acesso ao repo PARCIAL e não-confiável — recupera ficheiros por busca, não lê deterministicamente
os nomeados; marcou ficheiros existentes como "mortos" por não os ver (foi honesto e flagou a limitação
— passou na dimensão anti-fabricação). Consequência de routing:
- **Gemini → tarefas WEB (validação/pesquisa/red-team de fontes públicas) + raciocínio sobre material
  que o Cowork COLA no contexto (self-contained).** NÃO repo-reading (pointer-sweep, code-review de
  ficheiros do repo) até o acesso a ficheiros ser corrigido (workspace read completo no Agent mode, ou
  Gemini CLI com file tools comprovado).
- Regra geral: antes de rotear, confirmar que o agente TEM ACESSO ao material da tarefa. Tarefa
  repo-reading para agente sem repo-read = output honesto-mas-inútil (ficheiros existentes viram "n/d").
===== /sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/20-decisions/mooter-tese-v2-e-marco-2026-07.md =====
---
type: decision
project: Mooter
title: Tese v2 do Mooter — de "router local-first" para "cabine agêntica do vibe coder"
created: 2026-07-15
status: accepted
supersedes: ADR-0001 (2026-06-07, "Your LLM router. Local-first. Learns forever.")
tags: [mooter, decision, tese, marco, pivot]
---

# 🐮 Marco 2026-07-15/16 — Tese v2 do Mooter

> Decisão arquitetural estável. Detalhe operacional completo em
> [[../40-strategy/mooter-agentic-os-playbook]] — este ficheiro é o registo curto do PORQUÊ e do QUE MUDA,
> para consulta rápida sem ter de ler o playbook inteiro.

## O que mudou

**Antes (ADR-0001, 2026-06-07):** Mooter = "Your LLM router. Local-first. Learns forever." — um router de
LLM, posicionado pela economia (roteamento determinístico $0 vs. custo de API) e pelo aprendizado contínuo
(Pastor/bandit).

**Agora (tese v2, aplicada em PR #248, commit `1486af4`, 2026-07-15):** Mooter = a **cabine agêntica do vibe
coder** — o produto que torna possível operar como um mestre sem estudar todos os dias, com **visibilidade
total**, **alertas de gaps de fundação** e **magia visível**, pilotado do plugin VS Code. O router
local-first continua a existir, mas passa de PRODUTO para MOTOR: "**o motor é o fosso; a cabine é o
produto**". A régua de prioridade deixa de ser genérica ("economia") e passa a ser 5 experiências
concretas: **Resume · Plan · Route (invisível) · Watch · Review.**

## Porquê agora (o gatilho)

1. **A concorrência comoditizou a casca.** O VS Code nativo (Agent Sessions view / Agents window, 1.109+)
   já faz múltiplas sessões paralelas com worktree-isolation — o que o Cockpit vendia como diferencial de
   UI deixou de ser exclusivo (confronto de mercado 2026-07-13, ver histórico no repo).
2. **O custo como moat não aguenta escrutínio.** 65-82% de poupança vs. all-Opus é real e medido, mas é
   **wedge, não moat** — qualquer concorrente pode replicar roteamento $0. O que não se replica fácil é
   tempo economizado (Resume) e confiança (visibilidade + reversibilidade).
3. **"Learns forever" nunca foi provado.** O benchmark ficou dominado out-of-distribution; a alegação
   central da tese antiga não tinha evidência à altura de ser o mission statement.
4. **Consolidação técnica em curso** (Foundation Reset, Great Rename, spine V2 — a "sequência-mestra" do
   playbook) forçou a decidir a régua escrita ANTES de continuar a construir em cima dela — mudar código sem
   mudar a tese documentada primeiro já tinha sido identificado como erro noutra auditoria (advogado do
   diabo, 2026-07-13: "nenhum agente novo lê a tese nova em lado nenhum").

## O que concretamente já aterrou (2026-07-15/16)

- **PR #248** — régua nova em `AGENTS.md`, `CLAUDE.md`, `README.md`, `MOOTER_ROADMAP.md` do repo +
  `docs/foundation/SYSTEM_DESIGN.md` novo. `ADR-0001` marcado `Superseded by tese 2026-07-15 (commit
  1486af4, PR #248)` — não fica "Accepted" a apodrecer para um agente futuro (Codex lê `AGENTS.md`
  nativamente) reverter a decisão em silêncio.
- **PR #249** — Fase A do "Wave Handoff Spine V2" (Ledger/provenance do handoff preservados, docs-hygiene
  doctor) mergeável — infraestrutura que o Resume (uma das 5 experiências da tese v2) vai precisar.
- **Doutrina GPU-turbo** formalizada: todo token que um modelo local produz sem erro é turbo — não é só
  o router, é uma malha por baixo de specs/índices/resumos/handoffs.

## O que isto muda daqui para a frente

- O backlog do Mooter deixa de se organizar por "feature de router" e passa a organizar-se pelas 5
  experiências (Resume/Plan/Route/Watch/Review) e pelos 4 níveis de maturidade agêntica
  (Backbone/Memória/Interface/Distribuição) — linguagem de produto, não de engenharia.
- Nasceu nesta sessão uma ideia nova, ainda sem spec: **"Moos agentic configuráveis"** — uma superfície no
  plugin VS Code para o usuário configurar os moos locais (infra já existe: Fleet Arm GPU no talo,
  `fleet.json` caps, fleet-orchestrator). Isto é um candidato natural à experiência **Watch** e/ou **Plan**
  da tese v2 — mas precisa de spec própria antes de ir a qualquer agente executor. Ver nota em
  [[../40-strategy/mooter-agentic-os-playbook]] §2.
- `10-projects/mooter-canon.md` (o ficheiro de arranque rápido de sessão) tinha a tese antiga cravada na
  secção "Tese perene" — corrigido nesta sessão para apontar para este marco em vez de repetir a frase
  superada.

## Como não perder isto de novo

A tese antiga só sobreviveu tanto tempo sem ser corrigida porque estava espalhada em ficheiros diferentes
sem um dono único. A partir de agora: **`40-strategy/mooter-agentic-os-playbook.md` é o dono único da tese
viva.** Qualquer ficheiro que cite a missão do Mooter (vault ou repo) deve apontar para lá, não repetir o
texto — evita que uma frase desatualizada sobreviva escondida como aconteceu com o ADR-0001.
===== /sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/20-decisions/mooter-harmony-mesh-effort-dial-2026-07-16.md =====
---
type: decision
project: Mooter
created: 2026-07-16
updated: 2026-07-16
source: sessão Cowork 2026-07-16 (ciclo remediação F1–F3 + refinamentos do Paulo) · web verificada no dia
purpose: Registro durável do marco — por que a tese foi afiada para "maximização de custo afundado" e quais decisões de produto foram tomadas (effort dial, mesh, skills certificadas, Mission Control).
tags: [mooter, decisao, harmony-mesh, effort-dial, gpu, tese]
---

# Decisão 2026-07-16 — Harmony Mesh, effort dial e a tese afiada

## O que foi decidido (e o porquê de cada uma)

**1. O fosso tem nome: maximização de custo afundado.** Diagnóstico do Paulo ("o router já foi
commoditizado pelo OpenRouter") validado contra mercado: proxies de routing cobram markup por token de
API e não conseguem usar assinaturas já pagas nem a GPU do usuário. O Mooter é hook-não-proxy e faz os
dois ativos já pagos renderem o teto, 24/7, $0 marginal. Cloud players não copiam — o incentivo deles é
vender mais tokens. A tese v2 (motor=fosso, cabine=produto) continua; isto especifica QUAL parte do
motor é o fosso: não a seleção de tier (commoditizável), e sim assinaturas+GPU no teto.

**2. Effort dial por engine, nas 3 personas.** Cada engine paga ganha um dial na metáfora dos
subscription LLMs. GPU: LazyMoo (só checkers L0) · Moo (L0+L1 agendado) · CrazyMoo (máximo seguro).
❌ Rejeitada a escala paralela light/medium/high/extrahigh proposta inicialmente — seria a 4ª taxonomia;
as personas já existem no cockpit e são marca. ⚠️ Effort de GPU é GLOBAL da máquina; o lazy/moo/crazy
por-sessão do mode-registry (routing) é outro eixo — o Cockpit deve distinguir.

**3. Auto-yield como regra, comando como override.** A malha cede a GPU sozinha ao detectar uso
interativo (jogo/vídeo) e retoma sozinha — "melhores práticas automáticas, sem bronca" aplicado à
própria malha. `/moo effort` e `/moo pause <duração>` são exceção manual. Recibo em toda troca.

**4. Moos executores com fronteira dura.** Local executa transforms single-shot bounded (digest, index,
draft de LOOP, compressão, projeções) — mais rápido e $0. NUNCA agentic <30B (verificado 2026-07-16:
<7B falha sempre em tool-calling; é propriedade do modelo). NUNCA escrita canônica direta: draft
`moo-draft` + evento Ledger → reducer materializa (herda o single-writer da F1 por construção).

**5. Skills públicas só com certificação local.** Agent Skills = padrão aberto (anthropics/skills).
Moo skill pack exige score MooterBench no modelo local alvo com fixtures reais; sem medida, cloud-only.
Honest-copy doctrine aplicada a skills — diferencial de mercado real.

**6. Moo Mission Control recibos-first.** Telemetria em tempo real no plugin sobre fontes existentes
(gpu-stream, fleet, savings-tracker, Ledger). Regra anti-vanity: painel que não muda decisão do usuário
não entra. A métrica-mãe é o recibo (o que a GPU comprou hoje), nunca utilização por si.

## O que isto NÃO muda
Tese v2 e 5 experiências intactas · classify.js frozen · sequência de execução: F1–F3 → Lingua Franca
→ Mesh A → B/C → Setup Radar (nada fura a fila) · gates humanos do Paulo em tudo irreversível.

## Fontes
Repo: `_handoff/MOO_HARMONY_MESH_BLUEPRINT.md` (§0–§5, §1.5–1.9) · `_handoff/MOO_LINGUA_FRANCA_MASTERPROMPT.md`.
Playbook: [[../40-strategy/mooter-agentic-os-playbook]] §8. Web (2026-07-16): PromptQuorum (limites de
agentes locais) · anthropics/skills + SkillsMP (padrão aberto) · OpenRouter docs (modelo proxy).
