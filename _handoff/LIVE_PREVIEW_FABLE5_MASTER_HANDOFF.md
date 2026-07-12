# ⇄ HANDOFF Cowork→Cowork (Fable 5) · Live Preview/Edit — o North Star para "melhor que o Lovable"

> **Para quê:** esta sessão (Opus) construiu o Live Edit de MP5.2a → LP-4.9 em produção. Abre-se um
> **Cowork novo com Fable 5** (mais qualidade) para levar o Live Preview ao fim: UX/UI de topo,
> layout certo, cross-device, e o ciclo "clico → edito → prompt com contexto total → cross-check
> perfeito" melhor que o Lovable **com o poder do CC**. Este ficheiro é a fonte de verdade do
> arranque — lê-o inteiro + os estudos linkados antes de tocar em código.
> **Data:** 2026-07-08 · Repo `~/frugal` (⚠️ confirmar branch nativo — pode estar em wave/honest-controls).

## 0. Boot + como falar com o Paulo
Founder pós-exit, não-dev, sabbatical técnica. **PT-PT** ("ficheiro/ecrã/actualizar"), "tu",
founder-pragmatic, tabelas>prosa, marcadores ✅🔜🟡⚠️❌🔥❄️🛠. ❌ hype vazio, ❌ inventar números
("verifica em X"). Nomes próprios não se traduzem. Antes de afirmar sobre LLMs/dev-tools → web_search.
Vault `~/Documents/paulo-vault` (cruzar em decisões — hoje foi subusado, corrigir). Invariantes CI:
`classify.js` sha `427d8c0b…` FROZEN, packages frozen, sem `.md` novos na raiz, sem push/merge sem OK.

## 1. Estado ACTUAL em produção (confirmar nativo antes de construir)
**main ~`84871dc` · vsix v0.16.59 · ~889 testes verdes.** Aterrado e provado ao vivo:
| Camada | O que entrega |
|---|---|
| MP2→MP5.1 | App Stage (iframe dev-server real), diagnostics, click-to-code, select-to-edit determinístico $0 |
| **MP5.2a** | select-lock + breadcrumb + descer-ao-nó + 🗑 delete $0 + cerca `spliceNodeRange` fail-closed |
| **LP-4** | prompt ancorado (local Ollama $0 default + escalação SDK trusted-only) + undo + re-prompt |
| **LP-4.5** | agente ancorado (lê o repo, responde/edita no sítio certo, diff+reverter, allowlist estrita) |
| **LP-4.7** | Moo Quality Engine: best-of-N + retry-com-erro + **asset whitelist** (conserta o logo GitHub local $0) |
| **LP-4.8** | toolbar in-canvas + presets $0 + /skills (icon/copy/restyle/a11y/section) + multi-select |
| **LP-4.9** | UX: toggle Editar/Perguntar · X+minimizar+mover · feedback 🐮 · progressive disclosure · fix $22.95 |
| **FIX-MP-1** | tree-identity gate fail-closed nos 6 caminhos de escrita (escreve na árvore SERVIDA ou bloqueia) |
Provado ao vivo (2026-07-08): pin → toolbar → swatch/delete → **escreve no código local $0 na árvore
certa** (o feed "mudanças desta sessão" regista). ✅

## 2. Estudos/masterprompts JÁ PRONTOS (não recomeçar — despachar/integrar)
| Peça | Ficheiro | Estado |
|---|---|---|
| 🧠 **Context Engine** (o "cross-check perfeito, projecto todo") | `_handoff/LIVE_EDIT_CONTEXT_ENGINE_STUDY.md` | estudo completo, **não despachado** — é o eixo 5 do Paulo |
| 🚀 **LP-6 Publish** (preview→mooter.ai) | `_handoff/LIVE_EDIT_LP6_PUBLISH_MASTERPROMPT.md` | masterprompt pronto (deploy mock no gate, two-factor) — despachado |
| 🛡 **LP-5 Security** | `_handoff/LIVE_EDIT_LP4_LP6_VISION.md` §LP-5 | brief pronto, **não construído** (pré-req do Publish gate) |
| 🎬 **Director's Cut v2** (breakdown dia/LLM/fleet + animações + auto-journal) | `_handoff/DIRECTORS_CUT_V2_HANDOFF.md` | handoff completo, não despachado |
| 🧪 **Auditoria CCA** (evals Anthropic + OWASP/WCAG) | `_handoff/LIVE_EDIT_CCA_AUDIT.md` | Fase A (harness) em PR #229; correr depois de estabilizar |
| UX intuitiva | `_handoff/LIVE_EDIT_LP49_UX_INTUITIVE.md` | ATERRADO (LP-4.9) |

## 2.9 · ACTUALIZAÇÃO 2026-07-08 (tarde) — estado + as 6 considerações do Paulo + rename MEO
**Progresso desde a escrita deste handoff:** Frente 1 (cross-device) ✅ em main (inode-identity,
0.16.60, 2 rondas adversariais). Frente 2 (Context Engine) ✅ COMPLETA em main (0.16.62): Wave 2.1
métricas canónicas (canonical-metrics.ts, mata drift, $22.95 corrigido) + Wave 2.2 repo-map PageRank
+ import-slice + Wave 2.3 data-hop determinístico (@babel, zero deps — reusa o engine, NÃO Serena/
ast-grep). Provado ao vivo: o agente lê `canonical-metrics.ts` via **contexto pré-computado**, sem
grep às cegas — o cross-check funciona. **Régua de autonomia em vigor** (waves backend gated mergeiam
sozinhas; pára só em arquitectura/irreversível/vermelho/gate-segurança).

**⚠️ RENAME:** o "Director's Cut" passa a chamar-se **MEO — Moo Executive Officer View**. Usar MEO em
todo o lado novo.

**As 6 considerações do Paulo (a visão consolidada — ver o mock de layout 3-zonas):**
1. Clico → edições básicas (cor/apagar/ajuste) em **tempo real** no preview. ✅ feito, UX a arrumar.
2. Clico → prompt a um LLM (local ou subscrição) + ver o **histórico da conversa** até ao resultado
   final no preview. ✅ agente feito; o histórico visível é do MEO (a construir).
3. Botão **Review security** com a melhor skill de code-security-review, ANTES do publish. ❌ LP-5.
4. Registo perfeito de tudo no **MEO** (breakdowns dia/LLM/fleet + auto-journal). ❌ MEO v2.
5. Botão **Publish** estilo Lovable → prod, ver acontecer em produção. ❌ LP-6 (masterprompt pronto).
6. Todo pedido de edit fala com o **projecto todo** (ficheiros, código, Notion, 3rd brain),
   independente do LLM, preciso e perfeito. 🟡 Context Engine ✅ (código/ficheiros); Notion/3rd brain
   = espelhos (Camada C do Context Engine study) a ligar.

**PRIORIDADE Nº1 REVISTA:** Layout+UX (`_handoff/LIVE_PREVIEW_LAYOUT_UX_MASTERPROMPT.md`) — o Paulo
navegou e sentiu "nada funciona" pelo layout caótico (toolbar tapa o preview, 4 colunas, chat órfão),
NÃO pelo motor. Arrumar a moldura ANTES dos botões novos. Depois: LP-5 🛡 → LP-6 🚀 → MEO v2 → polish.

## 2.95 · Fase 0 do CC concluída (LAYOUT_RECON) + o STOP + 3 considerações novas do Paulo (2026-07-08 noite)

**A Fase 0 (recon read-only) já correu — o CC escreveu `_handoff/LAYOUT_RECON.md` (na worktree dele,
ainda não commitado) e PAROU no STOP. Diagnóstico dele, que muda o desenho:**
- O caos **NÃO é** proliferação de containers do VS Code. O manifesto contribui só **2 superfícies**:
  1 webview Cockpit (Activity Bar) + 1 panel Live Preview (editor). Toda a densidade está *dentro*
  desses dois, feita por ~15 renderers e um `extension.js` de 495 KB.
- **Cockpit** = 8 dashboards empilhados num **tab-bar custom** (Cockpit · Mission Control · Project
  Command · Arquitectura · +overflow: Setup · Agents · Decisions · Doctor), cada um ~350px, **vários
  meio-construídos** ("à espera…", "W5 soon") visíveis por default. O tab-bar custom compete com o
  chrome nativo do VS Code.
- **Live Preview** = toolbar densa (10+ ações) + iframe + log + toolbars flutuantes + uma `aside`
  que tapa o stage.
- **A API do VS Code permite** (confirmado nos docs): containers próprios na sidebar e no Painel
  inferior; N views empilham como secções **colapsáveis nativas** (colapso/resize/arrastar grátis —
  o que o tab-bar reinventa em HTML); `when`/context keys para **esconder o meio-construído**.
  Webviews **não** permitem splits internos (dentro é só HTML/CSS).
- **Conclusão:** corrige-se na **apresentação e arquitectura de informação**, não partindo o motor.

**O STOP do CC (5 decisões que a nova sessão Fable 5 tem de fechar com o Paulo antes da Fase 1):**
1. **Ambição:** A (só limpeza interna) · **C híbrido — RECOMENDADO** (Cockpit enxuto na sidebar +
   dashboards pesados no Painel inferior) · B (decomposição total em views nativas).
   → **Recomendação Cowork = arrancar já com D+A** (D = esconder o meio-construído via `when`/context
   keys; A = limpar a IA interna) — risco ~zero, prova antes→depois rápida — e **decidir C vs B
   depois, com evidência**. B é o horizonte, não o próximo passo.
2. Quais dos 8 dashboards são **load-bearing hoje** vs esconder/adiar (o Paulo indica).
3. Painel inferior é aceitável para os pesados, ou tudo fica na sidebar esquerda?
4. Live Preview: manter `Beside`? O layout interno dele entra nesta passagem ou na seguinte?
5. Screenshot "antes" (baseline Cockpit + Live Preview) — **o Paulo tira** (o CC não captura o VS
   Code do ambiente dele; é preciso para a régua "prova, não afirmes").

**⚠️ 3 CONSIDERAÇÕES NOVAS do Paulo (2026-07-08 noite) — tecer em TODAS as fases:**
1. **Seleção no preview = prompt-por-LLM em primeiro plano.** Ao clicar num elemento, a opção de
   **escrever um prompt para um LLM à escolha (local Ollama $0 ou subscrição)** tem de ser **óbvia e
   visual**, não escondida. Esse prompt **fala com o projecto como um todo** (Context Engine +
   Notion + 3rd brain) e resolve-se de forma **visual e perfeita** no preview. É o coração da feature.
2. **NÃO duplicar nem poluir o que já existe no plugin.** Aditivo e consolidador: reutilizar os ~15
   renderers e as superfícies actuais, **zero ficheiros/handoffs novos** desnecessários (já há 14
   handoffs de Live Preview — consolidar neste master, não empilhar). Cada wave *reduz* superfície,
   não acrescenta.
3. **Navegação + animações + informação em TEMPO REAL.** O utilizador tem de **ver o que está a
   acontecer enquanto acontece** — leitura de ficheiros, passos do agente, edição a aplicar-se,
   deploy a correr — com navegação clara e animações que comunicam estado (não decorativas). O
   "histórico da conversa até ao resultado" (MEO) e o feed em directo são parte disto.

**Nota de método para a Fable 5:** a decisão nº1 (D+A já) é reversível e prova-antes — pode arrancar
sem gate humano. As nº2–5 fecham-se em diálogo curto com o Paulo. Emite ao CC **um** masterprompt de
resposta ao STOP (responde 1–5 + injecta as 3 considerações) — não um novo ficheiro por fase.

## 2.96 · RESPOSTA AO STOP — decisões fechadas + masterprompt GO (2026-07-08 noite, Cowork Fable 5)

> **Para o CC:** este é o masterprompt de resposta ao teu STOP da Fase 0. As 5 decisões estão fechadas
> com o Paulo. **Um masterprompt, três fases, um gate no fim de cada — não há ficheiro novo por fase.**

### Evidências do baseline (print do Paulo, 2026-07-08 11:10 — o "antes" oficial; usa-as, não re-descubras)

- **Onde estás:** a Fase 0 correu na worktree **`frugal-eyeball`** (não `~/frugal`) — o `LAYOUT_RECON.md`
  está em `C:\Users\Paulo Loureiro\frugal-eyeball\_handoff\`, e essa worktree tem **9 uncommitted** →
  adds seletivos, não fechar, confirmar base antes da Fase 1.
- **Toolbar "mover" flutuante TAPA o hero do preview** (provado no print) → F3: o stage é rei.
- **🐛 Bug de UX provado:** o chat lateral "Resumir texto" respondeu "não vejo nenhum texto selecionado"
  com um `<p>` pinado e breadcrumb ativo → **a seleção NÃO é estado partilhado entre superfícies**.
  F3 cria **uma fonte de verdade de seleção** que toolbar + chat + prompt leem.
- **O prompt-por-LLM JÁ existe** (toggle Editar/Perguntar · chips AUTO/local `$0`/Haiku/Sonnet/Opus/
  `@fable` · "Perguntar lê o projeto todo") mas está **enterrado num painel denso com hint-text
  minúsculo** → consideração 1 = **ELEVAR o que existe**, não construir novo.
- **`n/d` espalhado e ruidoso:** GPU n/d (nvidia-smi ausente) · CPU n/d · custo n/d · 0% local ·
  "SAVED $0.05 · advisory" vs "real executado $0.00" lado a lado → F2 **agrupa** os n/d (honesto mas
  arrumado, sem espalhar ausências pela UI toda).
- **Fleet Console adormecido** (12 pilares · 0 loop · 12 idle · awaiting_eval 15d) e contadores
  spec/plan/review a zero → candidatos a esconder por default na F1 (adormecido = meio-construído
  para efeitos de UI; volta via comando).
- **As 4 tabs load-bearing já são as visíveis** (Cockpit · Mission Control · Project command ·
  Arquitectura) + overflow "…" → a decisão 2 mapeia limpo no que existe.
- **O feed em direto já tem semente:** "Director's Cut · 3 eventos" + "mudanças desta sessão de
  preview" + breadcrumb `page.tsx:57:15` → F3 eleva isto para "vês enquanto acontece", não cria do zero.

### As 5 decisões do STOP — FECHADAS

| # | Decisão | Resposta do Paulo |
|---|---|---|
| 1 | Ambição | **D+A JÁ** (D = esconder meio-construído via `when`/context keys · A = limpar a IA interna). C híbrido é o rumo provável DEPOIS, com evidência do antes→depois. B é horizonte, não passo. |
| 2 | Dashboards load-bearing | **Visíveis por default: Cockpit · Mission Control · Project Command · Arquitectura.** Esconder por default: **Setup · Agents · Decisions · Doctor** (voltam via comando/context key quando amadurecerem — nada se apaga). |
| 3 | Painel inferior | **SIM**, aceitável para os dashboards pesados. Nesta passagem NÃO se move nada para lá (isso é o C) — mas desenha o D+A sem fechar esse caminho. |
| 4 | Live Preview | **Mantém `Beside`.** O layout INTERNO dele (toolbar que tapa o stage, `aside`, log) entra **NESTA passagem**, como Fase 3 própria e gated. A visão 3-zonas completa (§5) fica para depois. |
| 5 | Screenshot "antes" | ✅ **TIRADO** (print 2026-07-08 11:10, Cockpit + Live Preview com o "mover" aberto a tapar o hero — ver evidências acima). Podes aplicar mudanças visuais; pede o "depois" ao Paulo em cada gate. |

### As 3 considerações do Paulo — tecer em TODAS as fases (não são fase própria)

1. **🔥 Prompt-por-LLM em primeiro plano na seleção.** Ao clicar/pin num elemento do preview, a opção de
   escrever um prompt para um LLM à escolha tem de ser **óbvia e visual** — input de prompt proeminente
   (não escondido atrás de toolbar), **picker de LLM visível** (default T0 local Ollama com badge `$0`;
   tiers/subscrição no dropdown; T5 só via `@fable`, nunca auto), e um **chip de contexto** que mostra que
   o prompt fala com o **projeto todo** via Context Engine (repo-map + import-slice + data-hop, já em main).
   Honesty-first: Notion/3rd brain ainda NÃO estão ligados ao engine — o chip mostra só o que é real
   (`repo ✓ · Notion n/d`), nunca fingir. A resolução aparece **no preview, visualmente**. É o coração da
   feature — se a Fase 3 entregar uma coisa só, é esta.
2. **❌ Não duplicar, não poluir.** Aditivo e consolidador: reutilizar os ~15 renderers e as 2 superfícies
   existentes; **zero ficheiros novos** salvo estritamente necessário para a separação de views (se o D
   exigir um ficheiro de manifesto/contribution novo, justifica no PR). Documentação: **consolidar neste
   MASTER e no LIVE_EDIT_ROADMAP — nenhum handoff novo**. O teu `LAYOUT_RECON.md` (worktree, não
   commitado): **não o commites como ficheiro** — funde as conclusões que ainda faltem como secção deste
   MASTER no mesmo PR e descarta o ficheiro. Cada fase **reduz** superfície, não acrescenta.
3. **Navegação + animações + informação em TEMPO REAL.** O utilizador vê o que acontece **enquanto
   acontece**: passos do agente, ficheiros a serem lidos (via contexto pré-computado), edição a
   aplicar-se, estado do dev-server. Animações **comunicam estado, não decoram** (spinner honesto,
   transição ao aplicar edit, pulso no elemento alterado). `prefers-reduced-motion` obrigatório.
   O histórico da conversa até ao resultado é lente do **MEO** (ex-Director's Cut — usar MEO em todo o
   lado novo); nesta passagem entrega o **feed em direto mínimo**, o MEO v2 completo vem depois.

### As 3 fases (uma worktree, uma branch, gates entre fases)

**Fase 1 — D: esconder o meio-construído (risco ~zero)**
- Cockpit: tabs **Setup · Agents · Decisions · Doctor escondidas por default** (context keys/`when` no que
  for contribution nativa; flag de estado no que for tab-bar custom interno). Comando para reexibir
  (ex.: `Mooter: Show advanced views`) — descobrível.
- Remover do default tudo o que mostra "à espera…"/"W5 soon" — **nada visível meio-construído**. O que
  ficar visível mostra dados reais ou `n/d` honesto (consideração 3).
- **GATE 1:** screenshot antes (Paulo) → depois (pede ao Paulo, tu não capturas o VS Code dele) · testes
  verdes (~889 + `live-preview-runtime.test.js`) · PÁRA para OK.

**Fase 2 — A: limpar a IA interna do Cockpit**
- Tab-bar custom enxuto com as 4 views load-bearing; hierarquia visual clara, densidade arrumada
  (~350px/dashboard hoje — rever espaçamento/tipografia dentro dos constrangimentos do webview).
- Não reinventar chrome do VS Code: onde a API der colapso/resize nativo de graça, prefere-o ao HTML
  custom — **sem** mover nada para o Painel inferior nesta passagem (decisão 3: caminho aberto, não usado).
- Tempo real no Cockpit: estados vivos (sessão, custo, routing) atualizam visivelmente — sem placeholders mortos.
- **GATE 2:** antes→depois + testes verdes + OK do Paulo.

**Fase 3 — Live Preview interno (o coração)**
- **Toolbar deixa de tapar o stage** (dock/auto-hide/reposição — o stage é rei); `aside` vira painel
  colapsável que nunca cobre o preview; log arrumado e colapsável.
- **Consideração 1 na íntegra:** seleção → prompt-por-LLM óbvio (input proeminente + picker LLM com
  default local `$0` + chip de contexto honesto "projeto todo") → resolução visual no preview.
  **ELEVAR o que existe** (Editar/Perguntar + chips já implementados), não construir novo.
- **Seleção = estado partilhado (fix do bug provado no baseline):** uma fonte de verdade de seleção
  que toolbar, chat lateral e prompt leem — o "Resumir texto" tem de ver o nó pinado.
- **Consideração 3 na íntegra:** feed em direto dos passos do agente/edição no próprio panel (mínimo
  viável; MEO v2 herda depois), animações de estado, navegação clara entre modos Editar/Perguntar (LP-4.9).
- Mantém `Beside`. Não tocar na cerca, no tree-gate, no agente, no quality engine — **só apresentação**.
- **GATE 3:** prova viva do fluxo completo (pin → prompt óbvio → edição $0 aplicada visível → feed em
  direto) + antes→depois + testes verdes + OK do Paulo.

### Régua (invariantes — quebrar = parar)

- `tools/router/classify.js` **FROZEN** (sha `427d8c0b…`, CI) · packages frozen salvo allowlist de wave.
- **Motor intocável**: cerca `spliceNodeRange`, tree-identity gate (FIX-MP-1), agente LP-4.5, quality
  engine LP-4.7, Context Engine — nesta wave só renderers/CSS/manifest/apresentação.
- Constrangimentos do webview (§6): `live-preview-view.js` concat-only via `fn.toString()` — **sem
  backticks/`${}`** (nem em comentários), sem require/Node/VSCode APIs no módulo, CSP nonce sem scripts
  externos, sem lib de charting, contrato `esc()`, `prefers-reduced-motion`, fail-soft, honesty-first.
- Git: worktree própria off `origin/main` · adds seletivos (**nunca** `git add -A`) · push só da branch ·
  **merge/escrita em main = Paulo** · sem `.md` novos na raiz.
- Deploy real **nunca** autónomo (two-factor); esta wave nem toca em publish (LP-6 é outra frente).
- PT-BR na conversa, EN no código/identificadores.
- **PROVA, não afirmes**: harness de runtime executa o webview a sério; screenshots antes→depois em
  cada gate; se um teste ficar vermelho, PÁRA — não marques fase como feita.
- No fim: **MOO HANDOFF** de volta + atualizar `SYNC.md` (snapshot ≤200 linhas) no mesmo PR.

### Depois desta wave (não fazer agora — só para orientar o desenho)
C híbrido (pesados → Painel inferior, decisão 3 já autoriza) → LP-5 🛡 Review security → LP-6 🚀 Publish
(masterprompt pronto) → MEO v2 (breakdowns + auto-journal) → polish UX/UI + auditoria CCA.

## 2.97 · PLANO "PRODUÇÃO PERFEITA" — W0→W6 (2026-07-09, decisões fechadas com o Paulo)

> **Objetivo:** todas as features do Live Preview perfeitas para produção — é o coração do Mooter.
> **Fontes cruzadas:** este MASTER · `docs/strategy/LIVE_EDIT_ROADMAP.md` (⚠️ stale 07-07) ·
> `_handoff/_archive/2026-07/LIVE_PREVIEW_AUDIT_FINDINGS.md` · `_handoff/CROSSDEVICE_RECON.md` ·
> `_handoff/LIVE_PREVIEW_COWORK_PERFECT_HANDOFF.md` (o runbook com o checklist §5 A-E — é a régua
> de aceitação deste plano) · Notion HQ. **⚠️ Descoberta-chave: main está À FRENTE dos docs**
> (LP-5 ✅ · LP-6 ✅ · FIX-MP-1 ✅ · Context Engine ✅ · cross-device ✅ · F1+F2 layout ✅ via PR #231),
> mas ROADMAP/SYNC ainda dizem "LP-5/6 🔜, P0 aberto". Reconciliar ANTES de construir.

### Decisões do Paulo (2026-07-09)
1. **W0 (Verdade) primeiro**, depois retomar F3. 2. **Camada C** (Notion/3rd brain no prompt) fica
para **W6**, depois da produção — W2 é só repo+SDK, chip honesto `repo ✓ · Notion n/d`.
3. **Probe do Mac**: o Paulo corre hoje/amanhã, antes da W3 (3 comandos do CROSSDEVICE_RECON §3).

### As waves (uma de cada vez, worktree própria off origin/main, gate humano entre cada)

| # | Wave | Conteúdo | Gate |
|---|---|---|---|
| **W0** | **Verdade** (~meio dia) | `git log`/tags reais de main vs docs; correr o **checklist §5 A-E do PERFECT_HANDOFF** item a item com evidência (L1-L4); veredicto real dos P1-3/4/6/7 + N1/N2 (fechados ou não?); **atualizar ROADMAP+SYNC no mesmo PR** (regra própria do ROADMAP); arquivar handoffs superseded | relatório ✅/🟡/❌ por item + docs reconciliados + PÁRA |
| **W1** | **F3 — o coração** (spec completa no §2.96) | seleção = estado partilhado (bug confessado pelo chat) · prompt-por-LLM óbvio (elevar o existente) · stage é rei · feed em tempo real | prova viva pin→prompt→edição no nó certo + antes→depois |
| **W2** | **Ponte do agente + contexto total (repo)** | `@anthropic-ai/claude-agent-sdk` no workspace + trust; linha de contexto "projeto TODO" ON; prova de que o prompt ancorado usa o Context Engine (contexto pré-computado, não grep); chip honesto | edição via agente no sítio certo com contexto provado |
| **W3** | **Produção-ready** | prova E2E ciclo local $0 (gap §8.1 do PERFECT) · HMR morto (P1-7) · nonce crypto (P1-3) · restantes P1/N1/N2 confirmados na W0 · **resultado do probe Mac** + fix casing se confirmar C1 + launcher `.command` (C2, committar) | suites verdes + probe Mac CONFIRMED + preview nunca finge frescura |
| **W4** | **Polish beat-Lovable** | design-critique loop contra a rubrica §2 do PERFECT · light/dark · motion premium (prefers-reduced-motion) · estados vazio/loading/erro · modo simples sem scroll | critique verde + screenshots antes→depois |
| **W5** | **Publish real 1× + CCA** | funil completo edito→🛡→🚀 em produção real UMA vez (two-factor, gatilho do Paulo) · CCA Fase A evals no CI | deploy real testemunhado + evals a correr |
| **W6** | **Camada C** | Notion/vault mirrors no prompt (decisões D1-D3 a fechar antes) · chip passa a `repo ✓ · Notion ✓` | prompt cita conteúdo Notion real |

∥ **MEO v2** corre em paralelo quando houver folga (masterprompt `DIRECTORS_CUT_V2_MASTERPROMPT.md`; F1.5 salvo em wave/directors-cut-v2).

### Masterprompt W0 (colar no CC quando os créditos resetarem)
GOAL: Wave VERDADE. NÃO construir nada novo — só apurar, provar e reconciliar.
DO: (1) `git log --oneline -40 origin/main` + tags + versão do vsix → tabela "o que está REALMENTE
em main" vs o que ROADMAP/SYNC/§1 deste MASTER afirmam; (2) correr o checklist §5 A-E do
`LIVE_PREVIEW_COWORK_PERFECT_HANDOFF.md` com evidência por item (harness L1/L2, host L3 sem GUI;
o que exigir olho humano → lista de spot-checks para o Paulo); (3) veredicto P1-2/3/4/6/7 + N1/N2
+ P2s: fechado (commit? teste?) ou aberto; (4) atualizar `docs/strategy/LIVE_EDIT_ROADMAP.md`
(§3 estados + §5 comboio → W0-W6 deste plano) e `SYNC.md` (snapshot ≤200 linhas) no MESMO PR;
arquivar `LIVE_PREVIEW_TOTAL_AUDIT_WAVE.md` e handoffs superseded para `_handoff/_archive/2026-07/`;
(5) relatório final: matriz ✅/🟡/❌ + o que a W3 herda.
GUARD: read-only no produto (docs podem mudar); classify FROZEN; adds seletivos; branch própria
off origin/main; merge = Paulo; PT-BR chat/EN código. PÁRA no relatório.

## 3. Os 5 eixos NOVOS do Paulo (2026-07-08) — o alvo desta sessão
1. **UX/UI de topo** — contínuo; usar skills `design:design-critique`, `design:accessibility-review`
   (WCAG 2.2), `design:ux-writing`, `design:design-system-management`. Implementação continua
   concat-only hand-rolled (§6), mas o DESENHO passa pelas skills.
2. **Layout do plugin (novo):** módulo principal à **ESQUERDA** (Cockpit + abas Mission Control/
   Project Command/Arquitectura), **modo Preview perfeito ao centro**, **Director's Cut à DIREITA**.
   Hoje tudo vive numa coluna/webview — reorganizar em 3 zonas coerentes (§5).
3. **Cross-device (novo, importante):** o preview **NÃO funcionou no MacBook**, só no Windows.
   Investigar e corrigir a portabilidade (§4) — é a peça de maior risco de "quebrar tudo".
4. **Melhor que o Lovable COM o poder do CC** — a barra competitiva (draw-annotation, voz,
   multi-device preview, version history) + os nossos fossos (honest $0, cerca, local-first, router-native).
5. **Clico → edito fácil → prompt (LLM/skill) → cross-check perfeito olhando o projecto todo** — é a
   soma de: toolbar (feito) + Context Engine (§2, o que falta) + /skills (feito). O cross-check é o
   Context Engine.

## 4. CROSS-DEVICE — a investigação prioritária (porque o Mac falhou)
Hipóteses a confrontar no código (read-only primeiro):
- **Separadores de path** (`\` Windows vs `/` Unix): o tree-gate (FIX-MP-1 `_servedRoot`/`_treeConfirmed`),
  o resolvedor `data-insp-path`→ficheiro, e o `realpath` podem comparar paths com separadores/casing
  diferentes → no Mac o gate bloqueia tudo. **Suspeito nº1.** Usar `path.sep`/`path.resolve`, normalizar.
- **Paths absolutos hardcoded** (`C:\Users\…`) em qualquer sítio do host → partem no Mac.
- **Porta/dev-server:** o preview precisa do dev server local a correr + a extensão instalada (vsix) +
  o repo clonado. Confirmar que o onboarding cross-device existe (ou documentar).
- **code-inspector-plugin** (data-insp-path) é build-time cross-platform — OK; o problema é host-side.
- **Case-sensitivity:** macOS APFS é case-insensitive-preserving, Linux case-sensitive → comparações
  de path têm de ser robustas.
Output: `_handoff/CROSSDEVICE_RECON.md` com a causa real + fix. Testar num fluxo Mac (o Paulo tem o
MacBook). ⚠️ Sem isto, "melhor que o Lovable" é falso — o Lovable corre em qualquer browser.

## 5. Layout do plugin — 3 zonas (o pedido do Paulo)
Alvo: **Cockpit+abas à esquerda · Preview ao centro · Director's Cut à direita.** Hoje o Live Preview
é um webview único com o Director's Cut empilhado por baixo. Reorganizar:
- Investigar as opções do VS Code: webview view containers (activity bar), editor-area webview panel
  (o preview grande), e um segundo webview na sidebar direita (Director's Cut). Confrontar o que o
  VS Code permite (um webview não controla o layout do editor; pode ser preciso 2 views + o preview
  no editor group). **Não prometer antes de confrontar a API.**
- Harmonizar: as 3 zonas partilham o snapshot; o Director's Cut à direita é a lente viva (v2, §2).
- ⚠️ Risco: mexer no layout pode partir o webview actual (concat-only, fn.toString()). Aditivo e faseado.

## 6. Constrangimentos DUROS do webview (quebrar = partir o plugin)
`live-preview-view.js` é módulo puro serializado por `fn.toString()`: **SEM template literals/backticks/
`${}`** (concat-only, até comentários), **SEM require/Node/VSCode APIs** (fs/agregação host-side),
**CSP nonce** sem scripts externos e **SEM biblioteca de charting** (barras div hand-rolled), contrato
`esc()` free-var, **prefers-reduced-motion** obrigatório, fail-soft everywhere. Honesty-first: todo
campo nullable, ausente → n/d, custo "~est.", nunca fabricar. (Detalhe em DIRECTORS_CUT_V2_HANDOFF §3.)

## 7. Ordem recomendada do comboio (uma frente de cada vez, gate entre cada)
1. **CROSS-DEVICE recon+fix** (§4) — desbloqueia o "em qualquer dispositivo"; maior risco, primeiro.
2. **Context Engine** (§2) — o cross-check perfeito; o eixo 5 do Paulo. Repo-map+LSP+ast-grep+data-hop.
3. **LP-5 🛡 Security** — pré-req do Publish gate.
4. **LP-6 🚀 Publish** (masterprompt pronto) — liga o preview ao mooter.ai, two-factor.
5. **Layout 3-zonas** (§5) — depois de o conteúdo estar certo, arruma-se a moldura.
6. **Director's Cut v2** (§2) — a lente da direita ganha breakdowns+animações.
7. **UX/UI polish + auditoria CCA** — o brilho final, com as skills de design.
Cada wave: worktree própria off origin/main · classify FROZEN · adversarial focada · push só da branch
· PÁRA para OK do Paulo · prova viva antes de aterrar. **Regra-mãe: PROVA, não afirmes** (harness de
runtime `live-preview-runtime.test.js` executa o webview a sério — foi a falta disto que deu o "clico e
nada visível").

## 8. Realidades operacionais (não repetir os tropeços de hoje)
- Instalar vsix: script `_handoff/prove-live-edit.cmd` (arranca dev server + limpa versões + instala +
  reabre na árvore certa). **Workspace = árvore servida** senão o tree-gate bloqueia (de propósito).
- Muitas frentes vivas → **sequenciar**, não abrir tudo (2 branches a tocar extension.js = merge hell).
- `~/frugal` pode estar em wave/honest-controls (deriva) — arrumar para main limpo quando possível.
- Poluição de `_handoff/` (~130 ficheiros) — há um handoff de arrumação `INFO_ARCHITECTURE_CLEANUP_HANDOFF.md`;
  correr numa sessão calma.
- Registo: memória Cowork + Notion HQ + vault (hoje o vault ficou 5 dias sem tocar — actualizar).

## 9. Régua de ouro
Cross-device antes de "melhor que o Lovable" (senão é falso). Cruzar>inventar. Honesto>bonito. Aditivo>
reescrita. Uma wave, um gate, uma prova viva. O Live Preview é a montra do Mooter — e o Director's Cut é
a prova de que não mente. Faz com maestria: o Paulo tem crédito e Fable 5 agora; a qualidade é o objectivo,
não a velocidade.
