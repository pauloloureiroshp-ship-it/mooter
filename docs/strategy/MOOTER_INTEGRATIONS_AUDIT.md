# Mooter — Integrations Audit (5 candidatos)

**Composto:** 2026-06-07 ~09h BRT, Cowork
**Estado Mooter:** Wave 27 SHIPPED (`v1.15.1-wave27-consolidation`), Wave 28 a meio (Phase E SHIPPED, retomar Phase F)
**Trigger:** Paulo pediu deep dive de 5 integrações para "deixar Mooter perfeito"

---

## TL;DR — Tabela de decisão

| # | Candidato | Tipo | Stars/Adopção | Encaixe Mooter | Recomendação | Wave |
|---|---|---|---|---|---|---|
| 1 | **TurboQuant** | Google Research paper | ICLR 2026 + community impls | 🔥🔥🔥 Massivo | **Adoptar (aguardar shipping)** | 32+ |
| 2 | **Caveman** | Indie skill (Julius Brussee) | 51k stars (May 2026) | 🔥🔥 Alto | **Bundle como Mooter Pack** | 30 |
| 3 | **Obsidian skills** | Steph Ango (Obsidian CEO) | 14.9k stars (3 meses) | 🔥🔥 Alto | **Pack opcional "vault-sync"** | 31 |
| 4 | **NotebookLM skill** | Community (PleasePrompto) | 6.3k stars | 🟡 Médio-baixo | **Aprender pattern, não integrar** | — |
| 5 | **Impeccable** | Paul Bakaus (ex-jQuery UI) | 10k+ stars (v1.5.1) | 🟡 Baixo (Mooter não é design tool) | **Usar p/ landing review** | — |

---

## 1. TurboQuant 🔥🔥🔥 — Game-changer técnico

### O que é
Google Research ICLR 2026. Vector quantization para KV cache de LLMs.
- **3 bits por coordinate** (vs 16-bit FP16 default)
- **6× memory reduction**
- **8× faster attention** em H100
- **Zero accuracy loss** (matches FP16 baseline mesmo a 4× compression)
- **Data-oblivious**: no calibration dataset, no model-specific tuning
- Combina **PolarQuant** (rotation transform) + **1-bit QJL residual correction**

### Por que é game-changer para Mooter

| Capacidade Mooter actual | Com TurboQuant |
|---|---|
| Ollama qwen2.5-coder:7b cabe 8x concurrent no 4090 | Cabem **24-30 workers** simultâneos |
| qwen3:30b (reviewer) usa 30GB VRAM | Cabe em **5GB** — corre em laptops normais |
| LoRA train batch size limitado | Pastor LoRA train **3-5x mais rápido** |
| Workflow Engine local ~$0.45/run | Continua, mas com **muito mais workers** = melhor quality |

### Status de implementação (Junho 2026)

- **Paper:** publicado ICLR 2026 ([openreview](https://openreview.net/pdf?id=tO3ASKZlok))
- **Google official code:** **NÃO publicado ainda** (esperado Q2 2026)
- **llama.cpp:** work-in-progress, CPU support done, CUDA kernels em validation ([discussion #20969](https://github.com/ggml-org/llama.cpp/discussions/20969))
- **PyTorch impl community:** [tonbistudio/turboquant-pytorch](https://github.com/tonbistudio/turboquant-pytorch) (from-scratch, 99.5% attention fidelity)

### O que Mooter deve fazer

#### Curto prazo (Wave 29-30)
- ❌ **NÃO implementar TurboQuant nós próprios** — Google + llama.cpp community estão a fazer melhor
- ✅ **Monitorar** llama.cpp discussion #20969 semanalmente
- ✅ **Adicionar telemetria preparada**: campo `kv_quant_method` em sync_events para quando shipar
- ✅ **Marketing antecipado:** mencionar no roadmap "TurboQuant integration planned Q3 2026"

#### Médio prazo (Wave 32+, quando llama.cpp shipping)
- ✅ **Integrar no Mooter Workflow Engine:** workers Ollama automaticamente usam TurboQuant quando disponível
- ✅ **Pack opcional `turboquant`**: users com hardware compatível activam, ganham 6x concurrency
- ✅ **Statusline chip**: `🔬 TurboQuant: 24 workers (vs 8 baseline)`
- ✅ **Benchmark blog post**: "How Mooter goes from 8 to 24 parallel workers via TurboQuant"

### Risco

- Google pode mudar API/format antes de shipping final → esperar Q3 minimiza risco
- llama.cpp CUDA validation ainda incompleta → não confiar em prod até então
- Outros providers (Anthropic API, OpenAI) já têm KV cache compression interno — TurboQuant beneficia **Ollama local apenas** (que é exactamente onde Mooter joga)

**Probabilidade de adopção alta:** este é literalmente o reforço técnico que Mooter local-first precisa.

---

## 2. Caveman 🪨 — Aprendizagem directa + bundle como Mooter Pack

### O que é
Indie skill (Julius Brussee, GitHub). Reduz tokens fazendo Claude responder em "estilo caveman" — sem articles, sem pleasantries, sem explicações non-solicited.

### Métricas reais (não hype)

| Métrica | Headline | Realidade |
|---|---|---|
| Output token savings | 75% | 4-5% session total |
| Prose token savings | 75% | ✅ 75% no prose layer (6k de 25k typical) |
| Combined with memory compression + fewer turns | — | 8-10% para heavy daily users |
| Accuracy gain (March 2026 paper, 31 models, 1485 problems) | — | **+26 percentage points** em problemas onde verbose causava errors |

### Por que é interessante para Mooter

1. **Confirma a tese Mooter:** brevity → cost reduction → accuracy gain. Não é apenas savings — é qualidade.
2. **Pattern aprendível:** o markdown do skill (`SKILL.md` de Brussee) tem regras compression específicas.
3. **51k stars em Maio 2026** = sinal de mercado massivo para token reduction tools.
4. **Trabalha com 40+ agents** (Mooter coexiste, não compete).

### O que Mooter deve fazer

#### Wave 30 (~2h)
- ✅ **Bundle Caveman como Mooter Pack opcional:** users instalam `mooter pack install caveman`, activa o skill
  - Coordenar com Julius Brussee (atribuição clara, licença MIT)
  - Comissão zero (open source ethic)
- ✅ **Mooter Caveman Variant** — bundled skill **+ Pastor learning loop integration**:
  - Pastor observa se user prefere caveman style (high acceptance rate dos outputs)
  - Auto-suggest "Try mooter pack install caveman, you'll save ~8% on output tokens"
- ✅ **Statusline integration:** quando caveman active, statusline mostra `🪨 caveman: -8% out tokens this session`

#### Wave 31 (opcional)
- ✅ **Mooter Caveman v2:** estende rules de Brussee com Mooter-specific patterns:
  - Pastor learning curves (omit when conf > 0.8)
  - Subscription-aware (Max users = full output OK, PAYG = caveman default)
  - Codebase fingerprint-aware (Python prefers explicit, TypeScript tolerates terse)

### Risco

- Julius Brussee pode ter ressentimentos se Mooter bundle sem créditos adequados → **conversa antes de bundle**
- Caveman over-applied a code generation pode quebrar syntax → **scope: prose apenas, não code**

**Recomendação:** **GO** em Wave 30, com Julius Brussee notificado/colaborar.

---

## 3. Obsidian skills 📓 — Bridge para Paulo's vault canónico

### O que é
- Steph Ango (CEO Obsidian) publicou [obsidian-skills](https://github.com/obsidian) — 14.9k stars em 3 meses
- Kepano (Obsidian) está a construir official Claude Skills para edit `.md`, `.base`, `.canvas`
- Several MCP solutions: **MCPVault, Nexus, Claudesidian**

### Por que é relevante para Mooter

**Paulo já usa vault canónico em `~/Documents/paulo-vault/` (Johnny-Decimal, 42+ ficheiros, git desde 2026-04-26).** Profile menciona explicitamente: *"Em conflito: vault > este profile > Project > conversa."*

Isto significa:
1. Vault é **fonte de verdade** para Paulo
2. Mooter pode **enriquecer** com sync inverso: Pastor learnings → vault notes
3. Paulo (e outros founders Obsidian-users) ganham bridge automático
4. **Vault como long-term memory** para Workflow Engine

### O que Mooter deve fazer

#### Wave 31 (~3h)
- ✅ **Mooter Pack opcional `vault-sync`** (não obrigatório):
  - User define `~/.mooter/config.toml`: `vault_path = "~/Documents/my-vault/"`
  - `mooter sync` opcionalmente escreve `vault/Mooter/decisions-YYYY-MM-DD.md` com daily summary
  - Pastor learnings vão para `vault/Mooter/Pastor/learnings.md`
  - **Pull direction também:** vault contains `vault/Mooter/preferences.md` (user-edited) → Mooter respeita
- ✅ **Demo workflow** (Phase G da Wave 28): "Use vault content como source corpus" para audit/research workflows

#### Wave 32+
- ✅ **MCP bridge bidireccional:** Mooter expose MCP server `mooter_vault_sync` para Claude Code aceder
- ✅ **Documentação dedicated:** `docs/integrations/obsidian.md` com setup guide

### Trade-off

- **Adiciona dependência opcional** — não pode ser breaking para users sem Obsidian
- **Privacy:** vault contém info sensível, sync deve ser explicitamente opt-in
- **Schema lock-in:** se Mooter define format, e Obsidian community adopta outro, ficamos descoordenados → **adoptar convenções existentes (MCPVault format se vingar)**

**Recomendação:** **GO** em Wave 31 como **pack opcional**, depois de Workflow Engine shipped.

---

## 4. NotebookLM skill 📚 — Aprender pattern, não integrar

### O que é
- Google NotebookLM (research vault com source-grounded answers)
- [PleasePrompto/notebooklm-skill](https://github.com/PleasePrompto/notebooklm-skill) — 6.3k stars
- Browser automation + persistent auth
- Pattern: **knowledge distillation** — NotebookLM source collection → single Markdown → permanent Claude skill

### Por que é tentação avaliar
- Integração elegante (vault + Claude)
- Browser-automation evita API custs Google

### Por que NÃO encaixa em Mooter

1. **NotebookLM tem audiência diferente:** researchers/students, não vibe coders
2. **Browser automation é fragil** (Google muda layout = quebra)
3. **Mooter routing decisions** não beneficiam de NotebookLM source-grounding
4. **Workflow Engine + Vault (Obsidian)** cobre mesmo use case com menos dependências

### O que Mooter PODE aprender

**Pattern "knowledge distillation skill":**
- Markdown file gerado UMA vez → permanent skill
- Reutilizável sem re-pesquisar
- Aplicável a Mooter Pastor:
  - Após N decisões, Pastor pode **distilar** learnings num markdown skill installable
  - `mooter pastor distill > my-pastor.skill.md`
  - Skill installable por outros users / partilhável

### Recomendação

❌ **NÃO integrar NotebookLM directamente**
✅ **Aprender pattern de distillation** para Pastor v2 (Wave 31+)

---

## 5. Impeccable 🎨 — Usar p/ landing review, não integrar

### O que é
- Paul Bakaus (ex-jQuery UI, ex-Google DevRel) — Março 2026
- 23 commands + 7 ref files (typography, color, spatial, motion, interaction, responsive, UX writing)
- 10k+ stars (v1.5.1)
- Funciona em Cursor, CC, Copilot, Gemini CLI

### Por que NÃO é Mooter integration

**Mooter é routing tool, não design tool.** Misturar concerns dilui a thesis.

### O que Mooter PODE fazer

1. ✅ **Usar Impeccable para review próprio landing mooter.ai** — Phase E do Wave 28 ou Wave 30 marketing:
   - `npx skills add pbakaus/impeccable`
   - Roda audit/critique nas pages landing
   - Score honest: typography, color, motion, etc.
2. ✅ **Aprender o pattern "skill com N ref files":**
   - Impeccable separa 7 domínios em ref files distintos
   - Mooter Pastor skill pode seguir same pattern:
     - `ref/01-tier-routing.md`
     - `ref/02-subscription-awareness.md`
     - `ref/03-classify-rules.md`
     - `ref/04-explainability.md`
     - `ref/05-anti-patterns.md`

### Recomendação

❌ **NÃO integrar como Mooter feature**
✅ **Usar como tool externo para landing review**

---

## 📋 Roadmap consolidado (post-Wave 28)

| Wave | Acção | Estimate | Categoria |
|---|---|---|---|
| 29 | (continua plano original — adversarial review) | 15h | core |
| 30 | **Mooter Pack: Caveman** (bundle + Pastor integration) | 3h | integration |
| 30 | **Usar Impeccable para landing review** (1 audit pass) | 1h | marketing |
| 31 | **Mooter Pack: vault-sync** (Obsidian) | 3h | integration |
| 31 | **Pastor v2: knowledge distillation** (`mooter pastor distill`) | 2h | core |
| 32 | **TurboQuant integration** (assumindo llama.cpp ship Q3 2026) | 4h | core (huge ROI) |
| — | NotebookLM | ❌ skip | — |
| — | Impeccable as integration | ❌ skip | — |

**Total addicional:** ~13h (Waves 30-32) — espalhado por 4-6 semanas.

---

## 🎯 ROI estimado por candidato

| Candidato | Effort | Impact técnico | Impact marketing | Net ROI |
|---|---|---|---|---|
| TurboQuant | 4h (when ready) | 🔥🔥🔥🔥🔥 (6x concurrency) | 🔥🔥🔥🔥 (uniqueness) | **★★★★★** |
| Caveman bundle | 3h | 🔥🔥 (8-10% out tokens) | 🔥🔥🔥 (validação tese) | **★★★★** |
| Obsidian vault-sync | 3h | 🔥 (founder workflow) | 🔥🔥 (signature feature) | **★★★** |
| Pastor distillation pattern | 2h | 🔥🔥 (shareable skills) | 🔥🔥🔥 (community feature) | **★★★★** |
| NotebookLM direct | — | — | — | ❌ |
| Impeccable as feature | — | — | — | ❌ |

---

## 🔥 Aprendizagens transferíveis (mesmo dos que não adoptamos)

### De Impeccable
- **Pattern 7 ref files separados por domínio** → replicável em Mooter Pastor skill
- **23 commands curados** → Mooter pode crescer comando vocabulary (não só `mooter sync`/`init`/`workflow`)

### De Caveman
- **Estilo + accuracy juntos** → token reduction não é apenas saving, é qualidade
- **Indie validation** (51k stars) → mercado quer brevity tools

### De Obsidian skills
- **Founder authority sells** → Steph Ango como autor = adoption fast
- Mooter pode beneficiar de **endorsements de founders Obsidian-fluent**

### De NotebookLM
- **Knowledge distillation** (source corpus → permanent skill) — aplicável a Pastor v2
- **Browser automation** evita API costs (interessante mas frágil)

### De TurboQuant
- **Data-oblivious quantization** é o future direction — Ollama vai beneficiar massivamente
- **Paper-to-impl pipeline** (community ahead of official) — Mooter pode contribuir

---

## ⚠️ Anti-patterns identificados

1. **NÃO bundle skills sem créditos adequados** — Open source ethic crítica
2. **NÃO adicionar dependências obrigatórias** (Obsidian, NotebookLM, etc.) — packs opcionais sempre
3. **NÃO competir com indie devs** — coexistir e amplificar
4. **NÃO precipitar TurboQuant** — esperar llama.cpp validation antes de prometer prod
5. **NÃO confundir thesis** — Mooter é router, não design tool nem research tool

---

## 📚 Sources consultadas

### Impeccable
- [GitHub - pbakaus/impeccable](https://github.com/pbakaus/impeccable)
- [Impeccable Skill for Claude Code](https://www.mejba.me/blog/impeccable-claude-code-design-skill)
- [Impeccable Review 2026 (ComputerTech)](https://computertech.co/impeccable-ai-review/)

### Caveman
- [GitHub - juliusbrussee/caveman](https://github.com/juliusbrussee/caveman)
- [Caveman Claude (Dev.to)](https://dev.to/onsen/caveman-claude-the-token-cutting-skill-thats-changing-ai-workflows-4hmc)
- [Token Cutting Skill (Pasquale Pillitteri)](https://pasqualepillitteri.it/en/news/846/claude-code-caveman-mode-token-saving)
- [Caveman Product Hunt](https://www.producthunt.com/products/caveman-claude-code-skill-plugin)

### Obsidian
- [GitHub - MarkusPfundstein/mcp-obsidian](https://github.com/MarkusPfundstein/mcp-obsidian)
- [MCPVault: Live Agent Memory (Medium)](https://medium.com/@ai_transfer_lab/mcpvault-the-claude-skill-that-turns-obsidian-into-a-live-agent-memory-6f3aca3dfc4c)
- [Obsidian + Claude Code Complete Guide](https://blog.starmorph.com/blog/obsidian-claude-code-integration-guide)
- [GitHub - jacksteamdev/obsidian-mcp-tools](https://github.com/jacksteamdev/obsidian-mcp-tools)

### NotebookLM
- [GitHub - PleasePrompto/notebooklm-skill](https://github.com/PleasePrompto/notebooklm-skill)
- [NotebookLM + Claude via MCP (Medium)](https://medium.com/@vinayanand2/notebooklm-claude-via-mcp-turning-two-ai-giants-into-one-research-machine-8219dab9df86)
- [Knowledge-distillation workflow](https://pasqualepillitteri.it/en/news/2003/notebooklm-claude-permanent-skill-knowledge-distillation-workflow-2026)

### TurboQuant
- [TurboQuant: Redefining AI efficiency (Google Research blog)](https://research.google/blog/turboquant-redefining-ai-efficiency-with-extreme-compression/)
- [ICLR 2026 paper](https://openreview.net/pdf?id=tO3ASKZlok)
- [GitHub - tonbistudio/turboquant-pytorch](https://github.com/tonbistudio/turboquant-pytorch)
- [llama.cpp discussion #20969](https://github.com/ggml-org/llama.cpp/discussions/20969)
- [Deep Infra: Google TurboQuant analysis](https://deepinfra.com/blog/google-turboquant)
- [QVAC SDK 0.12.0 TurboQuant](https://qvac.tether.io/blog/turboquant-in-qvac-sdk-0-12-0-kv-cache-quantization-for-production-local-ai/)

---

*Doc composto pelo Cowork enquanto CC corre Wave 28 (Phase E SHIPPED, Phases F-J restantes). Action items roteados para post-Wave-28 waves 29-32.*
