# Mooter Compaction Advisor — Design Study (2026-06)

> **Data:** 2026-06-14 · **Autor:** Paulo (composto no Cowork) · **Estado do mundo:** v1.39.0 / Wave 59A.
> **Origem:** ideia do Paulo — compactar no **momento óptimo** (fronteira de tarefa), antes do
> auto-compact de emergência do Claude Code, para ser mais rápido, barato e performático.
> **Método:** deep research, 3 frentes (prior art de timing · detecção de fronteira · scan de skills/repos),
> ~40 fontes, medido-vs-marketing separado.
> **Veredicto curto:** a ideia está **validada e por construir**. Ninguém junta as 3 peças que o
> Mooter pode juntar; e é território nativo da doutrina local-first/determinística.

---

## 0. TL;DR — porque isto é um diferenciador real

Todos os sistemas de compactação que existem disparam por **um de dois gatilhos burros**: **% da
janela** ou **contagem de tool-calls**. Nenhum decide pela **fronteira semântica da tarefa**, e
nenhum usa o **estado do cache** para escolher o instante. A própria Anthropic ainda não dá o hook
que tornaria isto automático (issue #58538 — *fechada como duplicada*; o texto da issue descreve
exactamente esta tese).

O **Mooter Compaction Advisor** junta três coisas que mais ninguém junta — e todas assentam na
doutrina (local-first, determinístico <50ms, zero-cloud, no-proxy):

1. **Detector de fronteira semântica** (não threshold de %) — usa o mesmo músculo do `classify.js`.
2. **Timing cache-aware** — usa o TTL do prompt-cache (5 min) e janelas user-away para escolher
   *quando* compactar é mais barato.
3. **Decisão local determinística** do "compactar agora?" — reforçada por embedding/LLM local na 4090
   só quando preciso.

---

## PARTE A — Prior art (o que existe vs o gap)

| Capacidade | Existe? | Quem | Como decide o momento | Gap |
|---|---|---|---|---|
| Reduzir bytes por tool-call (virtualização) | ✅ maduro | context-mode, claude-context | n/a | Ortogonal — reutilizável como *input reduction* |
| Snapshot/restore à volta do compact | ✅ maduro | context-mode, token-optimizer, memory-keeper | reage a `PreCompact` | Resolve "não perder estado", não "quando" |
| Trigger por **% da janela** | ✅ | token-optimizer (70/80/90/99) | threshold fixo | Burro: ignora fronteira e cache |
| Trigger por **contagem de tool-calls** | ✅ | strategic-compact (50+/25) | contador + nudge textual | "v0 da ideia" — fronteira é prosa, não código |
| **Disparar `/compact` por hook/skill** | ❌ nativamente impossível | issues #58538/#39275/#41818 | — | Bloqueio de plataforma |
| **Detecção de fronteira semântica** | ❌ ninguém | — | — | **GAP GENUÍNO** |
| **Timing cache-aware (TTL 5min)** | ❌ só display | cache-timer statusline | — | **GAP GENUÍNO** |
| **Decisão local determinística <50ms** | ❌ ninguém | — | — | **GAP — território Mooter** |

**Os mais próximos em espírito:** `alexgreensh/token-optimizer` (local, sem-deps, frugal — mas
trigger é threshold 70/80/90/99) e `affaan-m/.../strategic-compact` (sugere compact em "fronteiras
lógicas" — mas o código é só um contador de calls; a fronteira é retórica). **Isto confirma que o
problema é reconhecido e ainda não foi resolvido a sério.** Componentes a reutilizar:
snapshot/restore (estilo context-mode) e virtualização de input — não reinventar.

---

## PARTE B — O mecanismo

### B.1 Separar duas decisões: **QUANDO** (timing) e **O QUÊ** (eviction/summary)
- **QUANDO** = o IP do Mooter. Determinístico, host-side, <50ms.
- **O QUÊ** = reutilizar o que já existe (masking de tool-results, snapshot/restore, summary
  estruturado nativo). Achado-chave medido — *"complexity trap"* (NeurIPS DL4C 2025): **observation
  masking simples é tão eficiente quanto sumarização por LLM**. Logo: a acção barata chega quase
  sempre; o LLM só no último recurso. Alinha com a doutrina.

### B.2 Detector de fronteira — **cascata de 3 estágios** (barato→caro)
> Princípio Mooter: o sinal mais barato que resolve, resolve.

**Estágio 1 — Gate determinístico (sempre, ~0ms, zero-cloud).** Votação ponderada de sinais que o
harness Mooter **já tem**:
- transição de categoria do `classify.js` (ex.: `code_generation` → `debugging` → `docs`),
- mudança do *set de ficheiros em foco* (dir A → dir B),
- evento **commit / test-pass / PR** (fronteira causal forte — fim de unidade de trabalho),
- gap temporal entre turns (user-away).
Apanha as fronteiras **fortes e causais**. Melhor timing de todos: compactar **logo após um commit/
test-pass perde zero trabalho em voo**.

**Estágio 2 — Embedding drift local (só quando o gate é ambíguo, <100ms/turn na 4090).**
Running-centroid novelty: mantém um centróide móvel do tópico activo; dispara quando
`dist(turn, centróide) > média + N·σ`. ⚠️ **threshold por percentil da sessão (p90–p95), não
absoluto** — a lição medida ("When F1 Fails", 2025) é que *o threshold domina o resultado, não o
método*. Modelo: `all-MiniLM-L6-v2` (ou `bge-m3` para PT-PT) via Ollama. Apanha pivots semânticos
que o Estágio 1 não vê (mesmo ficheiro, objectivo novo).

**Estágio 3 — Árbitro qwen3 local (raro, só na zona cinzenta, sub-segundo).** Prompt binário
`SAME|NEW` sobre os últimos K turns. Caro demais por turn; perfeito como desempate. Resolve o ponto
fraco dos embeddings ("mesmo vocabulário, intenção nova").

⚠️ **Não comprar marketing:** semantic chunking **não** é magicamente superior (NAACL 2025 — chunks
fixos empatam). A vantagem do Mooter vem da **fusão** de sinais determinísticos baratos (que só nós
temos, por controlar o harness) com o drift — e de **expor o threshold ao loop de auto-learning**.

### B.3 Modelo de pressão (escada estilo ACC, determinístico)
Em paralelo com a fronteira, medir pressão por **tokens reportados pela API** (não estimativa local —
lição do OpenDev ACC):

| Nível | Pressão | Acção (barata primeiro) |
|---|---|---|
| Monitor | <70% | só observa tendência |
| Mask | ~80% | mascara tool-results antigos (>200 chars, fora da janela de recência) → ponteiro |
| Prune | ~85% | corta outputs fora da janela de recência |
| Advise | ~90% | **sinaliza compactação na próxima fronteira** |
| Emergency | ~99% | último recurso (deixa o CC nativo agir) |

ACC mede **~54% de redução de pico** e **15-20 → 30-40 turns** sem emergência, *na maioria sem chamar
LLM*. [MEDIDO]

### B.4 Gate cache-aware (o que torna o timing "perfeito")
- Prompt-cache: hit ~**0.10×** input, write **1.25×**, **TTL 5 min** (regrediu de 1h em Mar-2026).
- Compactar **reescreve o prefixo** → perde o cache quente. Logo o instante óptimo **não é "cedo
  porque há espaço"** — é **a fronteira onde o cache ia churnar de qualquer forma**: pós-commit + pausa
  (user-away) onde o TTL ia expirar. Aí a compactação é "grátis" de regret.
- Regra: **adiar** compactação enquanto o cache está quente e a tarefa activa; **disparar** na
  coincidência (fronteira forte + pressão ≥ Advise + cache prestes a expirar/já frio).

### B.5 Função de decisão (a junção)
```
boundary  = cascade()              # 0..1 confiança de fronteira
pressure  = ladder(api_tokens)     # Monitor..Emergency
cachecold = cache_ttl_state()      # quente | a-arrefecer | frio

decision =
  HOLD            se pressure < Advise E boundary fraca
  PREP-SNAPSHOT   se boundary forte (prepara o "previously on", não compacta)
  ADVISE-NOW      se (boundary forte E cachecold≠quente) OU pressure ≥ Advise
  AUTO-COMPACT    igual a ADVISE-NOW, quando #58538 desbloquear o trigger
```
Objectivo-função correcto (Factory, [MEDIDO]): **minimizar tokens-por-tarefa**, não por-request —
compactar agressivo que força re-fetch excede a poupança.

### B.6 Superfícies de saída
- **Hoje (advisory):** chip statusline `🪶 compact? (boundary+N% )` + nudge no `router-hint`
  + `PreCompact` hook que faz **snapshot priorizado** (o "previously on" estilo context-mode).
- **Loops agênticos do Mooter (já possível):** dar um tool `compact_context` aos subagentes do
  `spawn-orchestrator`/workflow nas fronteiras (padrão Google ADK / Redis) — aqui controlamos o loop.
- **Quando #58538 shipar:** trocar `ADVISE-NOW` por auto-trigger (mudança de 1 linha).

---

## PARTE C — Encaixe no Mooter (doutrina)

- **Host-side, no-proxy, zero-cloud, zero-LLM no caminho crítico** — o detector corre nos hooks
  (`UserPromptSubmit`/`PostToolUse`/`Stop`), lê sinais locais, decide <50ms. O LLM local só no
  Estágio 3 (raro) e na geração do summary (último recurso).
- **Reutiliza o que já temos:** a categoria do `classify.js` (Estágio 1), o stack Ollama (Estágios
  2-3), o `savings-tracker` (medir poupança), e o padrão de breadcrumb host-side
  (`workflow-locks-bridge.js`) para o estado do advisor.
- **É a forma forte do GAP 6** do `TOKEN_ECONOMY_SOTA_GAP_2026-06.md` (tool-result hygiene
  determinística) elevado a *advisor de timing*.
- **Reutiliza componentes externos** (não reinventa): snapshot/restore (context-mode), virtualização
  de input (claude-context) — como dependências opcionais, não como core.

---

## PARTE D — Realidade de plataforma & faseamento

**O que o Claude Code permite hoje (verificado):**
- ✅ `PreCompact`/`PostCompact` hooks (bloquear / snapshot / logar) — mas **observador**, não actuador.
- ✅ Override de threshold via env reportado (`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`) — ⚠️ **verificar no
  Day-0**; o controlo por `settings.json` é feature-request aberto (#41818/#46695).
- ❌ Disparar `/compact` por hook/skill — **impossível** (issue #58538 fechada-como-duplicada).
- ❌ Hook que exponha % de contexto de forma documentada — parcial/instável.
- ⚠️ Context-editing API (`clear_tool_uses_20250919`) — só na Messages API directa, não no CC CLI.

**Faseamento (cada fase entrega valor isolado):**

| Fase | Entrega | Depende de |
|---|---|---|
| **0 — Quick win** | `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` mais baixo (ex.: 70) + `PreCompact` snapshot | nada (config) |
| **1 — Advisor determinístico** | Estágio 1 (gate) + escada de pressão + chip/nudge + snapshot | hooks |
| **2 — Detector local** | Estágio 2 (embedding drift Ollama) + Estágio 3 (qwen3 árbitro) | Ollama (já existe) |
| **3 — Cache-aware** | gate de TTL/user-away na função de decisão | leitura de estado de cache |
| **4 — Auto-trigger** | trocar ADVISE-NOW por actuação | **#58538 upstream** |
| **(paralelo) — Agentic** | tool `compact_context` para subagentes do Mooter | spawn-orchestrator |

---

## PARTE E — Modelo de eficiência (honesto)

**De onde vem a poupança:**
1. **Evitar o emergency lossy a 99%** — compactar na fronteira preserva estrutura causal que a
   compactação tardia destrói (CWL case study Linux kernel: **23% mais barato** + preservou
   dependências). [MEDIDO]
2. **Compactar no ponto de perda-zero** (pós-commit/test) — não há trabalho em voo para perder.
3. **Cache-aware** — não thrashar o prefixo a meio de tarefa (cada compaction reseta 10× o preço dos
   tokens afectados). CWL admite que eviction agressiva **pode ser net-negativa para cache** — por
   isso o gate de TTL é essencial.
4. **Acção barata primeiro** — masking ≈ summarização em eficiência ("complexity trap", [MEDIDO]) →
   raramente pagamos a chamada LLM.

**Números de referência (de sistemas análogos, não nossos):** ACC **~54% pico** / turns 2×;
CWL **20-70%** custo, 89 tarefas/80M tokens/$55 sem degradação mensurável; Hermes **~75%** input
(claim). ⚠️ **Todos dependentes de condições** — o número do Mooter **tem de ser medido nas tuas
sessões reais** antes de qualquer claim público (gate humano, igual à política Wave 59B).

---

## PARTE F — Métricas & validação
- **Detector:** Pk / WindowDiff (não F1 puro — penaliza near-misses), numa amostra de sessões reais.
- **Eficiência:** tokens-por-tarefa (não por-request); taxa de compactações de emergência (deve cair);
  cache-hit-rate antes/depois (não deve degradar); turns-até-emergência.
- **Qualidade:** probe-based (Recall / Artifact-trail / Continuation / Decision) — o *artifact trail*
  é o ponto fraco universal medido (todos falham); manter um **índice de ficheiros determinístico**
  fora do loop LLM cobre o maior gap sem custo de modelo.

---

## PARTE G — Riscos & failure modes
- **Over-compaction** (fronteiras falsas) → perde contexto útil. Mitigar: exigir fronteira forte
  **E** pressão ≥ Advise para actuar; nunca compactar em HIGH_RISK a meio.
- **Cache thrash** → o gate cache-aware é obrigatório, não opcional.
- **Summary pobre** → perde info, agente refaz. Mitigar: summary estruturado + snapshot restaurável.
- **Bloqueio de plataforma (#58538)** → Fases 0-3 entregam valor **sem** auto-trigger; a Fase 4 é
  "pronto-a-ligar".
- **Latência do detector** → cascata garante que o caro (embed/LLM) só corre na zona cinzenta.
- **Threshold mal calibrado** → expor ao loop de auto-learning; percentil-da-sessão, não absoluto.

---

## PARTE H — Porque é diferenciador do Mooter
Nenhum router de LLM toca no **ciclo de vida do contexto do agente** — limitam-se a escolher modelo.
O Mooter já é o classificador determinístico local; estender esse músculo para decidir **quando
comprimir o contexto** é uma extensão natural e única. E usar o **modelo local (4090) para gerir o
contexto do agente cloud** é uma jogada que só faz sentido para um router **local-first** — é
estruturalmente impossível de copiar por um router que não tenha o eixo local. É o eixo
Tokens/contexto (Wave 61) levado ao **ciclo de vida**, não só ao input.

---

## Sources
- **Timing/eviction:** [OpenDev ACC — arXiv 2603.05344](https://arxiv.org/html/2603.05344v3) · [Beyond Compaction / CWL — arXiv 2606.11213](https://arxiv.org/html/2606.11213) · [Hermes context compression (Nous)](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/context-compression-and-caching.md) · [Factory — Evaluating Compression](https://factory.ai/news/evaluating-compression) · [Google ADK compaction](https://google.github.io/adk-docs/context/compaction/) · ["complexity trap" arXiv 2508.21433]
- **Detecção de fronteira:** [running-centroid novelty arXiv 2111.03496](https://arxiv.org/pdf/2111.03496) · [When F1 Fails arXiv 2512.17083](https://arxiv.org/abs/2512.17083) · [Is Semantic Chunking Worth the Cost? NAACL 2025](https://aclanthology.org/2025.findings-naacl.114.pdf) · [TextTiling/segmentation — AssemblyAI](https://www.assemblyai.com/blog/text-segmentation-approaches-datasets-and-evaluation-metrics) · [embedding drift — EvidentlyAI](https://www.evidentlyai.com/blog/embedding-drift-detection)
- **Prior art skills/repos:** [token-optimizer](https://github.com/alexgreensh/token-optimizer) · [context-mode](https://github.com/mksglu/context-mode) · [strategic-compact](https://github.com/affaan-m/everything-claude-code/blob/main/.agents/skills/strategic-compact/SKILL.md) · [mcp-memory-keeper](https://github.com/mkreyman/mcp-memory-keeper) · [claude-context](https://github.com/zilliztech/claude-context)
- **Plataforma:** [issue #58538 — trigger /compact via hook](https://github.com/anthropics/claude-code/issues/58538) · [#41818 compact_at_percent](https://github.com/anthropics/claude-code/issues/41818) · [CC Hooks reference](https://code.claude.com/docs/en/hooks) · [prompt caching CC](https://code.claude.com/docs/en/prompt-caching)
