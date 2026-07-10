# Live Edit — Roadmap & Spec Vivo (canônico)

> **FECHO "produção perfeita" (F-close), 2026-07-10** — PR único `wave/lp-producao-perfeita` → main
> (base `origin/main @c5cda85` / extensão `v0.16.66` / suites `1086/1086`), a superseder #234/#241/#242.
> Fechados com teste: W0→W2 · F0.1–F9 · findings P1-2/3/4/5/6/7 + N1/N2 · Codex D1/D5/D6(P0, TOCTOU fechado
> por revisão adversarial). Motor `classify.js` sha frozen; 0 deps novas. **Merge/deploy = gatilho do Paulo.**
> D7/D8/D9 (ícones/CTA/refresh-polish) e W5-real/W6 ficam fora deste PR (notados, não bloqueiam).
>
> **Reconciliado na Wave W0 (Verdade), 2026-07-10** contra `origin/main @f5a1f04` / extensão
> `v0.16.62` / suites `939/939`. Descoberta-chave: **main estava À FRENTE deste roadmap** —
> LP-4.8/4.9/5/6, Context Engine, cross-device e F1+F2 já em main; FIX-MP-1 (P0-1) e FIX-MP-2
> (P1-2) fechados. Plano de produção W0→W6 em `_handoff/LIVE_PREVIEW_FABLE5_MASTER_HANDOFF.md` §2.97.
>
> **Data original:** 2026-07-07 · **Fonte viva única** — substitui `LIVE_EDIT_LP4_LP6_VISION`,
> `MP5_SPEC`, `MP5_2_SelectLock_Spec`, `LP46_CONTEXT_PACK_STUDY`,
> `LP47_MOO_QUALITY_UX_STUDY` (consolidados nesta data; originais em `_handoff/_archive/`).
>
> **Regra de manutenção:** atualizar este arquivo **no mesmo PR** que muda o estado da
> feature (ver `AGENTS.md` § Information architecture).
>
> **Pointer-discipline:** este roadmap descreve **o quê** e **o estado**; o **como**
> detalhado (masterprompts completos, protocolo R1-R6, gates) vive nos arquivos-fonte
> apontados em cada seção.

---

## 1. Visão em 1 página

Dentro do **Live Preview** (App Stage no plugin VS Code, iframe → dev server local, sem
WebContainers), o usuário **seleciona** um elemento ou uma **área desenhada** do site vivo,
escreve um **prompt ancorado** àquela seleção, **escolhe o LLM** (chip router-native, local
$0 default) e a edição cai **só no selecionado** — com diff antes de aplicar, cerca
determinística por baixo e custo honesto sempre visível. O funil completo fecha com
**🛡 Review Security** (pipeline local $0, findings Critical bloqueiam publish) e
**🚀 Publish** (commit seletivo + deploy Vercel + confirmação two-factor).

Objetivo: passar o Lovable — mesma fluidez de gesto, mas **local-first, $0 no caso comum,
e honesto** (o preview nunca mente). Dogfood no próprio `mooter.ai` (landing).

## 2. Os 3 fossos (arquitetura essencial)

| # | Fosso | O que é | Por que ninguém copia |
|---|---|---|---|
| 1 | **Chip de modelo router-native** | O tier da edição aparece **na seleção** ("Moo faz isto local $0 · [subir p/ Sonnet]"), advisory sobre o mapeamento do router; override manual; `@fable` só opt-in; escalação nunca automática | Nenhum builder (Lovable/Bolt/v0/Replit/Cursor/Onlook) expõe escolha de modelo na seleção — exige ser um router |
| 2 | **Seleção de ÁREA (marquee)** | Região desenhada → screenshot recortado + nós DOM contidos (AABB sobre `[data-insp-path]`) + instrução, raciocinada como conjunto | Todos selecionam 1 nó DOM; ninguém funde área+DOM+screenshot+routing (MP5.3, ainda não iniciado) |
| 3 | **Edições determinísticas $0** | Texto/classe/delete por **byte-splice AST** sem LLM, regression-proof por identidade do nó (`data-insp-path`); prompt livre passa pela **cerca `spliceNodeRange`** (fail-closed: modelo só vê o subtree, escrita é byte-bounded) | É a doutrina "$0 quando não precisa de cloud" feita visual, local-first |

### Peças em main (base reconciliada W0 @f5a1f04, 2026-07-10; auditoria original @2c1a492)

| Peça | Arquivo | Papel |
|---|---|---|
| Motor de edição $0 | `packages/vscode-extension/src/live-edit-ast.js` | `applyDeterministicEdit` (text/class) + aditivos MP5.2a: `locateRange`/`deleteNode`/`spliceNodeRange` (fail-closed) |
| Tap dev-only (agente in-app) | `landing/app/_components/lp-error-tap.ts` | erros runtime/build/SSR + select-mode (hover/pick/pin/breadcrumb) + `postMessage` origin-locked |
| Host / painel | `packages/vscode-extension/src/extension.js` | recebe `lp-select`, painel de seleção, chip de tier, apply/delete, refusals honestos |
| Source mapping dev-only | `landing/next.config.ts` | `codeInspectorPlugin` só com `dev===true` → `data-insp-path="file:line:col:tag"` (dead-code em prod) |

**Invariantes:** `classify.js` FROZEN (sha `427d8c0b…4bc48f`, CI-enforced) · edits
determinísticos NUNCA tocam LLM · escrita de prompt livre SEMPRE via `spliceNodeRange` ·
selective `git add` · sem push/merge sem OK do Paulo · code-inspector dev-only ·
ações irreversíveis exigem confirmação two-factor.

---

## 3. Estado por etapa

Legenda: ✅ shipped em main com evidência · 🟡 shipped auto-declarado · 🔜 pendente · ⚠️ com finding aberto · ❌ não iniciado

### 3.1 Fundação (VER) — tudo em main, verificado pela auditoria @2c1a492

| Etapa | Entrega | Estado | Evidência |
|---|---|---|---|
| MP2 · App Stage | iframe do site + detecção de porta + estados honestos (offline/degraded) | ✅ | audit: `lp-stage.js`, CSP `frame-src localhost` |
| Honest Controls | badges por sessão sem falsos "unsaved" | ✅ | audit: `row-renderer.js` + teste de regressão |
| MP3.1 · Relógio tz local | timestamps na tz do usuário, `n/d` honesto | ✅ | unit tests dentro das suites (939/939 em W0) |
| MP3.3 · Multi-page nav | address bar + `lp-nav` sync + picker de rotas | ✅ | audit ✅ (back/forward: prova manual pendente) |
| MP4+4.1 · Diagnostics | error-strip 3 canais (runtime/build/SSR) | ✅ | audit: os 3 canais existem no código |
| MP4-polish · strip | classificação de severidade | ✅⚠️ | audit: hydration mismatch pode acender vermelho-fatal (P2-8) |

### 3.2 Live Edit (EDITAR) — o arco LP

| Etapa | Entrega | Estado | Fonte de detalhe |
|---|---|---|---|
| MP5.0 · Source map + click-to-code | `data-insp-path` no build dev; clicar → abre `file:line` | ✅ | em main · `codeInspectorPlugin` dev-only |
| MP5.1 · Select-to-edit determinístico $0 | painel texto/classe via AST + chip de tier | ✅ | **P1-2 FECHADO** (FIX-MP-2 `fbb3622`): fence simétrico FAIL-CLOSED `extension.js:1624-1668`; teste `lp-edit-host.test.js` |
| MP5.2a · Select-Lock + Delete $0 | pin persistente + breadcrumb + descer-ao-nó + `deleteNode` + cerca `spliceNodeRange` | ✅⚠️ | em main; **abertos** P1-5 (teste component-scope só string-presence `webview-syntax.test.js:96`) e P1-6 (copy parcial: avisos `:3475/:3479` presentes, falta framing "1ª instância") |
| MP5.2b / LP-4 · Prompt ancorado + modelo roteado | prompt livre no pin → moo local $0 → cerca → diff → aplicar; escalação cloud opt-in via Agent SDK | ✅ | **em main** (LP-4 §1-§6: `e2eb527`…`9dcba26`); harness runtime L1 `49c7d29`; `lp-prompt-host.test.js` |
| LP-4.5 · Tarefas ancoradas | 3ª via: tarefa de projeto via headless CC (SDK), allowlist workspace, edits feed unificado, device toggle | ✅ | **em main** (`22e57d5`, `866c87d`, `070eecd`); `lp-task-host.test.js`, `live-edit-task.test.js` |
| LP-4.7 · Moo Quality Engine | best-of-N + retry-2-rondas-com-erro + escalação por evidência + whitelist assets/imports + envelope estruturado + trial de modelo | ✅ | **em main** (`e26e663`, `f9aad55`, `2189d11`); `live-edit-quality.test.js`, `lp-quality-host.test.js` |
| LP-4.8 · UX in-canvas + Skills no pin | toolbar ancorada ao pin + presets $0 + `/skills` element-scoped + multi-select | ✅ | **em main** (`bf8220c`, `c07f7c4`, `4855654`, `e790f2d`); `lp-presets.test.js`, `lp-skills.test.js` |
| LP-4.9 · UX intuitiva | toggle Editar/Perguntar · disclosure progressiva · presets estrela · feedback tempo-real · chrome · coach marks · WCAG 2.2 · **Perguntar = fence** | ✅ | **em main** (`81d347e`…`63fc63b`, 9 commits); L1 `live-preview-runtime.test.js` |
| LP-5 · 🛡 Review Security | pipeline LOCAL $0 (secret · npm audit honesto · headers/CSP · XSS) + Critical bloqueia publish | ✅ | **em main** (`68cbc2a`, `d15079b`, `7cbaccd`, `f2a2ebd`); `lp-security-host.test.js`, `lp-secret-scan.test.js`, `lp-audit-summary.test.js` |
| LP-6 · 🚀 Publish | popover · gate no security · commit SELETIVO · deploy Vercel two-factor host-side | ✅ | **em main** (`0303b97`); `lp-publish-host.test.js` (deploy mockado; nome exato obrigatório). *Nits:* override de Critical sem UI; onboarding de CLI ausente = string crua |
| Context Engine · contexto $0-local | repo-map + import-slice + data-hop para o agente ancorado | ✅ | **em main** (Wave 2.2 `c7ef568`, 2.3 data-hop `e1cec41`); `lp-context-wire.test.js`, `live-edit-context.test.js` |
| Cross-device tree-gate | identidade de árvore por linhagem de filesystem (inode) — fix macOS | ✅ | **em main** (`938010f`); `lp-crossdevice.test.js` |
| F1+F2 · Layout cockpit | esconder meio-construído (D) + limpar IA interna (A) | ✅ | **em main** PR #231 (`3f8f93e`, `f5f0cb7`) |
| **F3 · Live Preview interno (o coração)** | seleção = estado partilhado (SelectionStore host-side único) · prompt-por-LLM óbvio · stage é rei · feed em direto | ❌ **W1 — próxima** | spec `_handoff/LIVE_PREVIEW_FABLE5_MASTER_HANDOFF.md` §2.96 |
| LP-4.6 / Camada C · Context Notion/vault | espelhos Notion/vault no prompt (camada C) | 🔜 **W6** (decisões D1-D3 pendentes) | idem §2.97 |
| MP5.3 · Seleção de ÁREA (marquee) | rect → AABB + screenshot recortado + multimodal | ❌ na fila, sem wave | `_handoff/_archive/` MP5_SPEC §3.3 |
| LP-7 · Before/after renderizado | diff VISUAL da UI antes de aplicar | ❌ leapfrog futuro | VISION |

**Suites (reconciliadas W0, 2026-07-10):** extensão **939/939** pass (run limpo, 15.1s) —
subiu de 646 (audit 07-06) com LP-4.8/4.9/5/6 + Context Engine + FIX-MP-1/2. `classify.js`
sha `427d8c0b…4bc48f` = gate CI `.github/workflows/test.yml`. (P2-13 do audit — drift de
números — resolvido aqui.)

---

## 4. Findings do audit (LP-AUDIT 2026-07-06, base @2c1a492) — veredicto W0 @f5a1f04

Fix masterprompts em `_handoff/LIVE_PREVIEW_AUDIT_FINDINGS.md` (FIX-MP-1..7).
**Estado em W0:** P0-1 e P1-2 **fechados**; P1-3/4/5/7 + N1/N2 **abertos** (a W3 herda); P1-6 parcial.

| # | Finding | Veredicto W0 | Evidência @f5a1f04 |
|---|---|---|---|
| P0-1 | Edição $0 não amarrada à árvore servida (A7) | ✅ **FECHADO** (FIX-MP-1) | `_treeGateBlocked()` `extension.js:1403` gate no edit/delete/task; `938010f`+`b0ac59b`+`f428a86`; `lp-crossdevice.test.js`, `lp-tree-host.test.js` |
| P1-2 | Fence de staleness assimétrico no edit | ✅ **FECHADO** (FIX-MP-2) | `fbb3622` fence simétrico FAIL-CLOSED `extension.js:1624-1668`; `lp-edit-host.test.js` |
| P1-3 | Nonce/HOST_TOKEN via `Math.random()` | ❌ **ABERTO** → W3 | `extension.js:1270/2554/4368` ainda `Math.random()`; FIX-MP-3 não aterrou |
| P1-4 | Director's Cut scroll no re-render 7s | ❌ **ABERTO** | `render(s)` `extension.js:2987-2993` full-replace sem save/restore |
| P1-5 | Teste comportamental component-scope | ❌ **ABERTO** | só string-presence `webview-syntax.test.js:96`, sem ramo +/− |
| P1-6 | Limitações 5.2a visíveis ao user | 🟡 **PARCIAL** | avisos `:3475/:3479` presentes; falta framing "1ª instância"+elisão+deepest-pick |
| P1-7 | Detecção de HMR morto | ❌ **ABERTO** → W3 | `lp-error-tap.ts:415` engole erro; sem sinal host `hmr-down` |
| N1 | Undo re-checar `_treeGateBlocked` | ❌ **ABERTO** (baixo risco) | `_revertSpliceItem`/`_undoLast` `:1742-1768` não chamam o gate (undo é sha-guarded) |
| N2 | "one active task" imposto/suavizado | ❌ **ABERTO** | `_taskRun` `:2302` sem guarda; comentário `:2356` exagera |
| P2-8..14 | hydration→vermelho · mode-registry flaky (0 neste run) · 15 cli Windows (não-LP) · shadow-DOM mudo · `#lp-status` sem `aria-live` · drift docs (=W0) · socket HMR (=P1-7) | 🟡 polish/aberto | ver findings doc |

**Nota positiva do audit (mantém-se):** `esc()` consistente · origin-lock exato · path-traversal
guards · refusals nunca escrevem · fence anti-comentário · CRLF/emoji byte-perfect · packaging
`@babel/parser` blindado por teste. A fundação honesta é real.

**Provas manuais pendentes** (exigem humano no VS Code): gate 5.2a vivo, N1 blank-screen,
MP4 3 erros vivos, N5/N6 HMR morto, N8/N9 teclado+NVDA, N10 scroll, N14 porta alheia —
lista completa no findings doc.

---

## 5. Comboio de execução — plano "produção perfeita" W0→W6 (2026-07-09/10)

**Fonte executável:** `_handoff/LIVE_PREVIEW_FABLE5_MASTER_HANDOFF.md` §2.97 (waves) + §2.96 (spec F3).
**Régua de aceitação:** checklist §5 A-E de `_handoff/LIVE_PREVIEW_COWORK_PERFECT_HANDOFF.md`.

| Wave | Conteúdo | Estado | Gate humano |
|---|---|---|---|
| **W0** Verdade | git-truth vs docs · checklist A-E com evidência · veredicto findings · reconciliar ROADMAP+SYNC | ✅ **feito** (07-10) | relatório ✅/🟡/❌ + docs reconciliados (este PR) |
| **W1** F3 — o coração | SelectionStore host-side único · prompt-por-LLM óbvio (elevar existente) · stage é rei · feed em direto | 🔜 **próxima** | prova viva pin→prompt→edição no nó certo + antes→depois |
| **W2** Ponte agente + contexto repo | `@anthropic-ai/claude-agent-sdk` + trust · "projeto TODO" ON · chip `repo ✓ · Notion n/d` | ⏳ | edição via agente no sítio certo com contexto provado |
| **W3** Produção-ready | herda P1-3/4/5/6/7 + N1/N2 · prova E2E ciclo $0 (gap §8.1) · probe Mac + casing/launcher | ⏳ | suites verdes + probe Mac + preview nunca finge frescura |
| **W4** Polish beat-Lovable | design-critique §2 · light/dark · motion · estados vazio/loading/erro · modo simples sem scroll | ⏳ | critique verde + screenshots antes→depois |
| **W5** Publish real 1× + CCA | funil edito→🛡→🚀 em produção real 1× (two-factor, gatilho Paulo) · evals CCA no CI | ⏳ | deploy testemunhado + evals a correr |
| **W6** Camada C | Notion/vault no prompt (D1-D3) · chip `repo ✓ · Notion ✓` | ⏳ | prompt cita conteúdo Notion real |

**Régua de modelo:** Sonnet = volume de código · Opus = arquitetura + wiring delicado + segurança ·
`@fable` só opt-in, nunca auto · ❌ nunca segurança/UI em Haiku.

**Regras do comboio:** worktree própria off `origin/main` por wave · commits atômicos, adds seletivos ·
wave N+1 só após merge (Paulo) da N · zero deps novas sem allowlist `.vscodeignore` +
`live-edit-packaging.test.js` · testes verdes ANTES de cada commit · deploy real de produção
NUNCA autónomo (two-factor host-side).

---

## 6. Fontes consolidadas

| Arquivo (em `_handoff/_archive/` após esta consolidação) | Contribuiu |
|---|---|
| `LIVE_EDIT_LP4_LP6_VISION.md` | visão do arco LP-4→LP-6, correções do advogado do diabo na LP-4 v2, LP-4.5 tarefas ancoradas, briefs LP-5/LP-6, regra "3 waves atômicas, não mega-wave" |
| `LIVE_EDIT_MP5_SPEC.md` | os 3 fossos, arquitetura dos 5 órgãos (source-mapping, tap in-app, marquee, prompt inline, two-speed), faseamento MP3→MP5.3, masterprompts MP3/MP5.0-5.1 |
| `LIVE_EDIT_MP5_2_SelectLock_Spec.md` | spec MP5.2 (lock/breadcrumb/descer-ao-nó/cerca AST/prompt ancorado), inventário do que já existia em main, limitações honestas (component scope, `.map()`), masterprompts 5.2a/5.2b |
| `LIVE_EDIT_LP46_CONTEXT_PACK_STUDY.md` | arquitetura de contexto em 3 camadas (pack $0 + fatia por seleção + espelhos), decisões D1-D3 pendentes, masterprompt LP-4.6 |
| `LIVE_EDIT_LP47_MOO_QUALITY_UX_STUDY.md` | quality engine (best-of-N, retry com erro, whitelist de assets — caso do logo GitHub/Lucide 1.0), respostas aos 4 gaps do Paulo, comboio ordenado, draft LP-4.8 |
| `SUPER_WAVE_LP48_LP5_LP6.md` (fica ATIVO em `_handoff/` — é o executável do comboio) | masterprompts finais das waves A/B/C, routing de modelo com os $50, decisão direct-to-production, two-factor não-negociável |
| `WAVE_LP2_MP5_SelectToEdit.md` (histórico) | estado da wave MP5.0+5.1 executada; nota do WIP `feat/live-edit @6d44ccd` (usar só como referência, não mergear) |
| `LIVE_PREVIEW_AUDIT_FINDINGS.md` (fica ATIVO em `_handoff/` — contém os FIX-MPs) | matriz de veredictos por feature, P0-1 + 6×P1 + 7×P2 com evidência file:line, números reais das suites, provas manuais pendentes |
