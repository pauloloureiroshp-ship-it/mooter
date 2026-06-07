# MOOTER — Architecture V5: the synthesis layers (L12–L16)

**Reanálise · 2026-06-07 · lente: arquitecto end-to-end + VC + privacy · Owner: Paulo Loureiro**

> **Estende V4, não o substitui.** V4 (`ARCHITECTURE_V4.md`) definiu o pipeline de routing em camadas 0–11 + Layer X (telemetria). V5 adiciona **5 camadas de síntese (L12–L16)** que vivem *ao lado* do pipeline, todas **opt-in** e **zero-proxy** — nunca se sentam entre o user e o modelo. V4 continua válido na íntegra; nada das camadas 0–11 foi modificado.
>
> **Confidence:** V4 estava ~80% certo no *routing*. V5 acrescenta o que torna o Mooter **não-comoditizável** se a Anthropic shippar routing dinâmico nativo: hardware/setup awareness, ecosystem, LoRA, compressão e qualidade — coisas que dependem do *contexto do user*, não do modelo.

---

## 0. TL;DR honesto — 6 conclusões

1. **V5 = V4 + 5 camadas de síntese.** L12 compressão (LLMLingua), L13 LoRA hot-swap, L14 Setup Intelligence, L15 Ecosystem Awareness, L16 Prompt-Quality. Wave 29 entrega a **fundação** de todas; bandits/federated/hot-swap reais chegam nas Waves 30–34.
2. **Nada modifica o routing existente.** `classify.js` (sha `7b01eb86…`) intacto; `inject_context.js`, `subagentstop_hook.js`, Pastor v1, Workflow Engine (Wave 28) — todos intocados. As novas camadas são aditivas.
3. **Opt-in por defeito.** Em passive mode, L12–L16 não fazem nada observável. O user liga o que quiser. Privacy-first: telemetria só guarda *features estruturadas*, nunca conteúdo de prompt; DP + k-anonimato ≥ 50 em qualquer agregado público.
4. **A doutrina vence sempre.** Qualquer camada que decida (LoRA routing-stub, bandit-stub, DeepSeek T2 heuristic) é *advisory*: `classify.js` mantém o tier como guardrail duro. As stubs devolvem `null` por design até as Waves de produção.
5. **O moat são L13–L16.** Routing puro comoditiza-se; setup/ecosystem/LoRA/qualidade aprendem do *user e do repo* — switching cost real.
6. **16 camadas não é over-engineering** — é separação de responsabilidades com gates atómicos por camada (ver §7). Cada uma shippa e testa isolada; nenhuma é obrigatória.

---

## 1. O que V4 faz bem (não tocar)

| Componente V4 | Avaliação | Razão |
|---|---|---|
| Pipeline 0–11 (cache → … → federated) | ✅ Manter intacto | É o core de routing; V5 não lhe toca |
| `classify.js` tier = guardrail duro | ✅ **Crítico, manter** | HIGH_RISK floor; nenhuma camada V5 o sobrepõe |
| Champion-challenger shadow routing | ✅ Manter | Único caminho seguro de promoção |
| Subscription-aware bias | ✅ Amplificar | V5 generaliza-o em L14 (setup) |
| Honest savings (65–82%) | ✅ Manter | V5 acrescenta L12/Caveman, mede honesto |

---

## 2. O que falta no V4 — 5 gaps que V5 fecha

1. **O prompt é desperdiçado** — sem compressão, pagam-se tokens de input redundantes (→ **L12**).
2. **O modelo local é genérico** — sem adaptação per-task/per-user (→ **L13**).
3. **O Mooter não sabe nada do hardware/subscrições do user** — recomenda no escuro (→ **L14**).
4. **O ecossistema (skills/plugins/MCP/packs/providers) é invisível** — o user não sabe o que instalar (→ **L15**).
5. **As decisões não são medidas multi-dimensionalmente** — sem isto, não há aprendizagem (→ **L16**).

---

## 3. Arquitectura V5 — 16 camadas

V5 = V4 (L0–L11, ex-"Layer 0–11") + Layer X (telemetria, absorvida por L16) + **5 camadas de síntese**.

```
L0  Cache              L6  Cascade
L1  Guardrails         L7  Personalisation (per-user)
L2  Features           L8  Codebase fingerprint
L3  kNN                L9  Skill-graph decomposition  (Workflow Engine, Wave 28)
L4  Confidence+judge   L10 Provider arbitrage         (+ DeepSeek V4 T2 option, 29.D)
L5  Tier dispatch      L11 Federated aggregation      (skeleton /v1/federated, 29.K)
                       ── synthesis ──────────────────────────────────────────
L12 LLMLingua compression   · opt-in input-token reduction
L13 LoRA hot-swap           · per-task adapter swap (foundation only)
L14 Setup Intelligence      · hardware/software/subscription detect + recommend
L15 Ecosystem Awareness     · curated catalog + per-setup recommendations
L16 Prompt-Quality          · multi-dimensional decision telemetry → learning
```

> **Numbering note.** V4 usa prosa "Layer N" 0-indexada (0–11) + "Layer X". V5 normaliza para `L0–L16`: L0–L11 = as camadas V4 na mesma ordem; **Layer X (telemetria) é absorvida por L16** (o RDTR torna-se a base do `pastor_v2_decisions`). Não há colisão — L12–L16 são inteiramente novas.

### 3.12 L12 — LLMLingua compression (opt-in)

**Posição:** antes do dispatch, sobre o prompt montado. **Nunca** entre user e modelo — devolve uma string comprimida que o caller decide usar.
**Operação:** dois backends — `llmlingua` (perplexity-based, via subprocess Python, quando importável) ou um **redutor heurístico entity-safe** (stopword/filler/whitespace) que preserva paths, código, URLs, erros, versões. Floor de budget: prompts pequenos passam intactos (`backend: "none"`).
**Impl:** `packages/synthesis/src/lingua/` · CLI `mooter compression test|status` · default OFF.
**Honest:** a heurística sozinha atinge ~1.4–1.7× (só remove filler); o ganho grande (4–10×) exige o backend LLMLingua real. Medido, não prometido.

### 3.13 L13 — LoRA hot-swap (foundation only)

**Wave 29 = infra apenas.** Catálogo de adapters + loader de validação manual. **Sem auto-swap** — `routing-stub.ts` devolve sempre `null` (a doutrina: `classify.js` decide o tier; LoRA nunca o sobrepõe).
**Impl:** `packages/synthesis/src/lora/` (registry, loader, routing-stub) · CLI `mooter lora list|show|load` · seed `pastor-v1-default` (Wave 31 ready).
**Wave 31 (Pastor v2 / LORAUTER):** auto hot-swap per-task + vault-sync + distillation.

### 3.14 L14 — Setup Intelligence (Paulo Vector A)

**Operação:** reutiliza os probes do router (`gpu-probe`, `vram_detect`, `detect-subscriptions`, `hardware-matcher`) e sintetiza um `setup_profile.json` (24 datapoints: hardware/software/subscriptions/derived), explica-o e recomenda por hardware-class.
**Impl:** `packages/synthesis/src/setup/` (detect/explain/recommendations) · CLI `mooter setup detect|show|recommend`.
**Telemetria opt-in:** `device_setup_profiles` (migration 014), anónima, k-anon ≥ 50.

### 3.15 L15 — Ecosystem Awareness (Paulo Vector B)

**Operação:** catálogo curado (`audit/ECOSYSTEM_CATALOG_v1.json`, 104 items: skills+plugins+MCP+packs+providers) + recomendações per-setup ranqueadas por `compatibility × roi_estimate × pastor_signal` (pastor default 1.0 → reduz-se a `compat × roi`).
**Impl:** `packages/synthesis/src/ecosystem/` (catalog/recommend/roi-tracker) · CLI `mooter ecosystem list|recommend|search|info`. ROI tracker é stub (full Wave 30).

### 3.16 L16 — Prompt-Quality Intelligence (Paulo Vector C)

**Operação:** uma linha por decisão de routing em `pastor_v2_decisions` (≈30 features), **só features, nunca conteúdo** (allowlist client-side + privacy-refine no hub). Alimenta o bandit (L16.2, Wave 30) e a sabedoria federada (L16.3, Wave 31+).
**Impl:** `packages/synthesis/src/quality/` (decision-logger + bandit-stub) · migration 013 + route `/v1/pastor-v2` · CLI `mooter quality stats|status`. Bandit devolve `null` (Wave 30).

---

## 4. Princípios non-negotiable (V4 + V5)

1. **No proxy** — a síntese nunca se senta entre user e LLM.
2. **classify.js wins** — tier é guardrail duro; toda decisão de camada é advisory.
3. **Zero LLM cost na classificação** — compressão/setup/ecosystem são regex/heurística/lookup.
4. **Privacy first** — features estruturadas, nunca prompt content; DP noise + k-anonimato ≥ 50.
5. **Opt-in defaults** — passive mode = nada observável; o user liga cada camada.
6. **Explainability** — cada decisão logada carrega `reasoning`.
7. **Subscription-aware** — recomendações honram Pro/Max/Team.
8. **Tag pós-merge**; **sha de `classify.js` verificada antes da tag**.

---

## 5. Estado por camada (honesto)

| Camada | Wave 29 | Produção real |
|---|---|---|
| L12 LLMLingua | ✅ heurística + passthrough Python; opt-in | backend perplexity default (Wave 32) |
| L13 LoRA | ✅ registry/loader/stub (sempre null) | auto hot-swap (Wave 31) |
| L14 Setup | ✅ detect/show/recommend reais | — (completo) |
| L15 Ecosystem | ✅ catálogo 104 + recommend | ROI attribution (Wave 30) |
| L16 Quality | ✅ schema + logger (features-only) | bandit Thompson (Wave 30) + federated (Wave 31) |
| L10 DeepSeek T2 | ✅ provider + heuristic advisory | full open-weight routing (Wave 33) |
| L11 Federated | ✅ skeleton + k-anon gate | DP-SGD aggregation (Wave 31/34) |

---

## 6. Benefícios — 3 lentes

- **User:** vê o seu setup explicado, recebe recomendações certas, poupa tokens (L12/Caveman), tudo opt-in e privado.
- **Cientista IA:** telemetria multi-dimensional honesta → base para bandits/federated sem violar privacy.
- **VC:** L13–L16 são switching cost real (aprendem do user/repo) — defensáveis mesmo que routing comoditize.

---

## 7. Ressalva antecipada: "16 camadas é demasiado"

V4 §7.2 já avisava "12 camadas é muito — risco de over-engineering". V5 leva a 16. A defesa:

- **Cada camada shippa e testa isolada** (Wave 29: 6 commits atómicos, ~80 testes novos, gate por fase). Não há big-bang.
- **Nenhuma é obrigatória** — opt-in; em passive mode o sistema é exactamente o V4.
- **As stubs são honestas** (`null` até produção), não código morto a fingir funcionar.
- **A doutrina mantém-nas em cheque** — nenhuma sobrepõe `classify.js`.

Se uma camada não provar valor medido (ver gates de cada Wave), **é cortada, não mantida por inércia**. O número de camadas é um detalhe; o que importa é que cada uma é opcional, testada e reversível.

---

## 8. Resumo numa frase

V5 acrescenta ao routing do V4 cinco camadas opt-in e privacy-first — compressão, LoRA, setup, ecosystem e qualidade — que aprendem do *contexto do user* e tornam o Mooter defensável mesmo num mundo de routing comoditizado, sem nunca tocar no que já funciona.
