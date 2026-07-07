# LP-4.7 + LP-4.8 — Moo Quality Engine · UX in-canvas · Skills no pin (estudo + masterprompts)

> **Pedido do Paulo (2026-07-06):** double-check SOTA + 4 gaps: (1) botão security ausente,
> (2) botão publish ausente, (3) UX/UI fraca, (4) slash commands/skills na seleção. Obs: moo
> local falhou a inserir o logo GitHub; Opus conseguiu.
> **Pesquisa web 2026-07-06** (~29 fontes, ✅=primária): digest abaixo; fontes no fim.

---

## 0. A revelação do logo GitHub (o teu teste, explicado)
**Lucide 1.0 (Jun 2026) REMOVEU todos os ícones de marca — incluindo GitHub** (pressão legal;
redirect oficial para Simple Icons) ✅ infoq.com/news/2026/06/lucide-v1-icons + BRAND_LOGOS_STATEMENT.md.
Logo: import `Github` de lucide-react = quebrado; fallback = escrever o SVG do octocat de
memória (small models alucinam paths ✅ arxiv 2412.11102). O Opus sabe o path de cor; o 30b não.
**Classe de falha: conhecimento de assets — corrige-se com whitelist + verificador de imports, $0.**
Bónus: o Lucide agora publica `llms.txt` oficial para tooling AI — injectável no prompt.

## 1. Digest da pesquisa — o que muda no nosso desenho

| Técnica | Evidência | Ganho esperado |
|---|---|---|
| **Best-of-N (3-5) + verificador $0** (a nossa cerca parse+fence É um verificador determinístico perfeito) | Weaver (Stanford): +17.9% p/ 8B com verificadores FRACOS; "Budget Reallocation" (arxiv 2404.00725): N do pequeno > 1 do grande | muito alto · esforço trivial |
| **Retry com o erro exacto, máx 2 rondas → escala** | arxiv 2604.10508: 2 rondas capturam 76-95% do ganho; erros de parse reparam à taxa mais alta; >2 rondas raramente resolve | muito alto · trivial — e a escalação vira REGRA DE ROUTING baseada em evidência (on-brand!) |
| **Whitelist de assets/ícones + verificador de imports** | §0; anti-import-alucinado: arxiv 2604.07755 | mata a classe do logo GitHub · baixo |
| **Envelope estruturado, não JSX-grammar** — Ollama structured outputs só p/ `{"jsx": string, "new_imports": string[]}` | "format tax" 10-15% se sobre-constranger (arxiv 2408.02442, 2604.03616); constranger só o envelope evita chatter/markdown-fence | médio · baixo |
| **Troca/tier do moo de edição** | **Qwen3-Coder-Next** (Ollama; MoE 80B/3B activos, offload CPU, 40-60 t/s reportado em 4090 🟡; **66.2% Aider oficial** ✅ arxiv 2603.00729 — o melhor formato-compliance local-runnable; treinou search-and-replace FIM) · alternativa full-VRAM: **Qwen3.6-27B dense Q4** (77.2% SWE-V vendor ✅; amiga de speculative decoding — MTP no llama.cpp dá ~2x em DENSE, não em MoE batch=1) · Devstral Small 2: agentic+multimodal mas 4-8% Aider (formato) — NÃO para edits estritos | alto · médio — benchmark na NOSSA fence pass-rate decide |
| **Caminho determinístico p/ style-only** (playbook Lovable ✅ lovable.dev/blog/visual-edits: tweaks simples SEM LLM) | já temos text/class; expandir p/ presets (cor/spacing/size 1-clique) | alto · médio |
| Validação académica da arquitectura | "Cascaded Code Editing: Large-Small Model Collaboration" (arxiv 2604.19201, Abr 2026) = exactamente moos-drafts→cloud-verifies | narrativa/GTM |

## 2. Respostas aos 4 gaps do Paulo

1. **🛡 Security button** — não está em falta por esquecimento: é a **LP-5**, sequenciada
   depois do quality engine (os "Try to fix" do security usam o runner + as técnicas da 4.7).
   UI = paridade com o print Lovable: painel Detected Issues (Critical/Warning) + fix por
   finding + dependencies review. Brief no VISION.md.
2. **🚀 Publish button** — **LP-6**, popover paridade Lovable (URL Vercel · custom domain ·
   visibilidade · estado do security como gate · Update two-factor).
3. **UX/UI fraca** — diagnóstico da pesquisa: o nosso painel vive TODO na coluna direita;
   Lovable/v0/Cursor põem a interação **NO elemento** (toolbar flutuante na seleção; Cmd+K
   "selection is the contract"). Fix = LP-4.8: **toolbar in-canvas ancorada ao pin**
   (prompt + chips + acções) com o painel direito só para diffs/feed. + presets 1-clique
   determinísticos (§1) + multi-select Cmd/Ctrl (Lovable attach-as-reference).
4. **Slash/skills na seleção** — prior art: Continue.dev slash commands com routing por
   comando ✅; Lovable presets; **NINGUÉM tem skills element-scoped com routing por skill —
   água aberta para o Mooter**: `/icon` (whitelist Simple Icons+lucide llms.txt) · `/copy`
   (moo pequeno) · `/restyle` (determinístico+moo) · `/a11y` (checklist+fix) · `/section`
   (agente). Cada skill = template + few-shot + tier floor próprio; o chip mostra o routing.

## 3. O comboio actualizado (ordem por impacto/dependência)

| Wave | Entrega | Porquê nesta ordem |
|---|---|---|
| **LP-4.7 · Moo Quality Engine** | best-of-N + retry-2-rondas-com-erro + escala-por-evidência + whitelist assets/imports + envelope + trial Qwen3-Coder-Next vs Qwen3.6-27B na fence pass-rate | trivial de construir, ganho máximo, conserta a dor do logo JÁ; tudo o resto (skills, security fixes) herda a qualidade |
| **LP-4.6 · Context Pack** (estudo próprio já feito) | pack A+B (+C espelhos depois) | o agente passa a saber o projecto; combina com 4.7 |
| **LP-4.8 · UX in-canvas + Skills no pin** | toolbar flutuante no pin · presets determinísticos · /skills com routing por skill · multi-select | UX vira Lovable-grade com fosso router-native |
| **LP-5 · 🛡 Security** | painel paridade Lovable + pipeline local + fixes via runner | usa 4.6+4.7 |
| **LP-6 · 🚀 Publish** | popover paridade Lovable, gated pelo 🛡 | fecho do funil |

## 4. ⇄ MASTERPROMPT · LP-4.7 (pronto a colar; Sonnet)
```
# ⇄ COWORK→CC · WAVE LP-4.7 · Moo Quality Engine — best-of-N + retry evidence-based + asset whitelist
Lê _handoff/LIVE_EDIT_LP47_MOO_QUALITY_UX_STUDY.md §0-§1. R1-R6. classify FROZEN (427d8c0b…).
R1: worktree wave/lp-4-7-quality ../frugal-lp47 off origin/main.
DO (commit por peça):
1. Best-of-N na via cercada local: N=4 amostras T=0.7 (1ª tentativa T=0.1 single); cada uma
   passa parse+fence+import-check; 1ª válida ganha; telemetria pass-rate p/ Director's Cut.
2. Retry-com-erro: falhou tudo → 2ª ronda (máx 2) com o erro EXACTO da fence no prompt;
   falhou de novo → painel oferece escalação com evidência: "moo local falhou 2×(motivo) —
   subir para Sonnet?" (nunca sobe sozinho; chip honesto).
3. Whitelist de assets: prompt do moo ganha bloco "ícones UI: SÓ nomes lucide desta lista
   (fonte llms.txt vendorizada em .mooter/); logos de MARCA: simple-icons ou estes SVGs
   inline vendorizados (GitHub incluído); lucide NÃO tem brand icons desde v1.0". →
   import-verifier: qualquer import novo tem de resolver em node_modules/package.json;
   senão rejeita com motivo honesto.
4. Envelope estruturado: Ollama structured output {"jsx": string, "new_imports": [string]}
   — só o envelope, JSX livre lá dentro (evita o format tax); new_imports alimenta o passo 3.
5. Trial de modelo (relatório, SEM trocar default): correr a suite de edits reais (goldens
   do repo + o caso do logo GitHub) contra qwen3:30b vs qwen3-coder-next vs qwen3.6-27b
   (se puxáveis no Ollama da máquina) → tabela fence-pass-rate/latência em
   _handoff/LP47_MODEL_TRIAL.md; recomendação; decisão de default fica para o Paulo.
GUARD: vias/cercas/allowlist intactas · escalação NUNCA automática · zero deps novas ·
vendored assets em .mooter/ (llms.txt + SVGs, commit — são do produto) · selective add ·
PÁRA antes do merge.
GATE: caso real "insere o logo do GitHub no hero" resolve LOCAL $0 (whitelist) · pass-rate
antes/depois medida e colada · retry+escalação com evidência visível · 727+novos verdes ·
sha intacta · push só da branch.
```

## 5. LP-4.8 (draft curto — afinar pós-4.7)
Toolbar in-canvas no pin (shadow DOM, junto ao overlay): [caixa prompt] [chips modelo]
[presets: cor·tamanho·spacing determinísticos] [/skills dropdown] [🗑] [↩]. Painel direito
fica para diff/feed/resposta. /skills v1: /icon /copy /restyle /a11y /section — template +
few-shot + tier floor por skill (Continue.dev-style, routing visível no chip). Multi-select
Cmd/Ctrl → attach de vários nós como referência (Lovable). Masterprompt completo quando a
4.7 aterrar.

## Fontes principais
infoq.com/news/2026/06/lucide-v1-icons ✅ · lucide BRAND_LOGOS_STATEMENT.md ✅ · arxiv:
2603.00729 (Qwen3-Coder-Next, Aider 66.2%) · 2604.10508 (retry 2 rondas) · 2404.00725 +
Weaver Stanford (best-of-N) · 2408.02442/2604.03616 (format tax) · 2601.13384 (search-replace
tuning) · 2604.19201 (cascaded editing) · 2604.07755 (import alucinado) · 2412.11102 (SVG) ·
ollama.com/blog/structured-outputs + new-model-scheduling ✅ · aider.chat/docs (edit formats,
weak models → whole) ✅ · lovable.dev/blog/visual-edits + docs.lovable.dev/features/design ✅ ·
v0.app/docs/design-mode ✅ · docs.continue.dev/customize/slash-commands ✅ · morphllm/relace
(fast-apply, 🟡vendor) · codersera runtime update Mai-2026 🟡 (MTP dense 2x, não-MoE batch=1).
