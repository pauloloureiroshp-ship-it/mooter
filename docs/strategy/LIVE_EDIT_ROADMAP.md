# Live Edit — Roadmap & Spec Vivo (canônico)

> **Data:** 2026-07-07 · **Fonte viva única** — substitui `LIVE_EDIT_LP4_LP6_VISION`,
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

### Peças em main (confirmadas pela auditoria @2c1a492, 2026-07-06)

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
| MP3.1 · Relógio tz local | timestamps na tz do usuário, `n/d` honesto | ✅ | audit: unit tests dentro dos 646/646 |
| MP3.3 · Multi-page nav | address bar + `lp-nav` sync + picker de rotas | ✅ | audit ✅ (back/forward: prova manual pendente) |
| MP4+4.1 · Diagnostics | error-strip 3 canais (runtime/build/SSR) | ✅ | audit: os 3 canais existem no código |
| MP4-polish · strip | classificação de severidade | ✅⚠️ | audit: hydration mismatch pode acender vermelho-fatal (P2-8) |

### 3.2 Live Edit (EDITAR) — o arco LP

| Etapa | Entrega | Estado | Fonte de detalhe |
|---|---|---|---|
| MP5.0 · Source map + click-to-code | `data-insp-path` no build dev; clicar → abre `file:line` | ✅ | audit @2c1a492 · wave `WAVE_LP2_MP5_SelectToEdit.md` |
| MP5.1 · Select-to-edit determinístico $0 | painel texto/classe via AST + chip de tier | ✅⚠️ | audit: cadeia completa, MAS `_applyEdit` sem fence de staleness (P1-2) |
| MP5.2a · Select-Lock + Delete $0 | pin persistente + breadcrumb + descer-ao-nó + `deleteNode` + cerca `spliceNodeRange` | ✅⚠️ | audit: merge `78dd9da` em main; abertos P1-5 (teste component-scope) e P1-6 (limitações invisíveis ao user) |
| MP5.2b / LP-4 · Prompt ancorado + modelo roteado | prompt livre no pin → moo local $0 default → cerca → diff → aplicar; escalação cloud opt-in via Agent SDK | 🟡 (auto-declarado; confirmar no git) | narrativa do VISION/LP-4.5 mostra a LP-4 executando ao vivo em 2026-07-06 (caso CommunityPulse, teste do logo GitHub), mas nenhum arquivo-fonte cola commit/merge da LP-4 em main |
| LP-4.5 · Tarefas ancoradas | 3ª via: tarefa de projeto via headless CC (SDK), allowlist workspace, edits feed unificado, device toggle | 🟡 (auto-declarado; confirmar no git) | LP46_STUDY refere "a tarefa (b) de hoje demorou 52.6s" e "allowlist pós-adversarial de hoje" (2026-07-06) — execução implícita, sem evidência git nos arquivos-fonte |
| LP-4.6 · Context Pack | pack pré-compilado $0 (camada A) + fatia por seleção (B) + espelhos Notion/vault (C, v1.1) | 🔜 estudo pronto; wave NÃO executada; decisões D1-D3 do Paulo pendentes | `_handoff/_archive/LIVE_EDIT_LP46_CONTEXT_PACK_STUDY.md` (masterprompt §5) |
| LP-4.7 · Moo Quality Engine | best-of-N + retry-2-rondas-com-erro + escalação por evidência + whitelist assets/imports + envelope estruturado + trial de modelo | ✅ (declarado no SUPER_WAVE como "origin/main ACTUAL tem LP-4.7"; confirmar no git) | `_handoff/_archive/LIVE_EDIT_LP47_MOO_QUALITY_UX_STUDY.md` §4 |
| LP-4.8 · UX in-canvas + Skills no pin | toolbar flutuante ancorada ao pin + presets determinísticos $0 + `/skills` element-scoped (`/icon` `/copy` `/restyle` `/a11y` `/section`) + multi-select | 🔜 Wave A do comboio | `_handoff/SUPER_WAVE_LP48_LP5_LP6.md` |
| LP-5 · 🛡 Review Security | pipeline LOCAL $0 (secret-scan · npm audit honesto · headers/CSP · XSS estático · /public) + moo explica em PT + try-to-fix cercado + Critical bloqueia publish | 🔜 Wave B (só após merge da A) | idem |
| LP-6 · 🚀 Publish | popover paridade Lovable · gate duro no security · commit SELETIVO (nunca `add -A`) · deploy Vercel **direct-to-production** (decisão Paulo 2026-07-07) · two-factor obrigatório (escrever nome do projeto) · telemetria de custo do ciclo | 🔜 Wave C (só após merge da B) | idem |
| MP5.3 · Seleção de ÁREA (marquee) | rect → AABB sobre `[data-insp-path]` + screenshot recortado (CDP clip) + multimodal | ❌ na fila, sem wave agendada | `_handoff/_archive/LIVE_EDIT_MP5_SPEC.md` §3.3 |
| LP-7 · Before/after renderizado | diff VISUAL da UI (não só código) antes de aplicar | ❌ leapfrog futuro, não prometido | VISION (item 6 do advogado do diabo) |

**Suites (números exatos da auditoria 2026-07-06):** extensão **646/646** (re-run limpo) ·
landing **207/207** · cli 637/653 (15 falhas pré-existentes de ambiente Windows, zero
relação com Live Edit). Números anteriores nos handoffs (617, 635, 727) estão stale —
a baseline real em main é 646 (P2-13).

---

## 4. Findings abertos (audit LP-AUDIT, 2026-07-06, base @2c1a492)

Fix masterprompts prontos em `_handoff/LIVE_PREVIEW_AUDIT_FINDINGS.md` (FIX-MP-1..7).
**Nenhum fix foi executado** até a data deste roadmap. 1×P0 · 6×P1 · 7×P2.

| # | Finding | Sev | Fix |
|---|---|---|---|
| P0-1 | **Edição $0 não amarrada à árvore que o preview serve** (A7): porta detectada por TCP puro, path resolve contra `_wsRoot()` — escreveu na worktree errada e disse "✓" (incidente forense 2026-07-06 06:49, rasto: `landing/app/page.tsx` com `<CrookOutline size={48} />` apagada, uncommitted — triagem do Paulo pendente) | ⚠️ P0 | FIX-MP-1 (tree-identity handshake + recusa fail-closed) |
| P1-2 | Fence de staleness assimétrico: `_deleteNode` fail-closed com sha256, `_applyEdit` escreve incondicionalmente | P1 | FIX-MP-2 |
| P1-3 | Nonce CSP e HOST_TOKEN via `Math.random()` (segredo adivinhável) | P1 | FIX-MP-3 (crypto.randomBytes, ~3 linhas) |
| P1-4 | Director's Cut: `innerHTML` full-replace a cada 7s sem restauro de scroll | P1 | FIX-MP-4 |
| P1-5 | Fix do component-scope warning SEM teste comportamental (contradiz o brief da 5.2a) | P1 | FIX-MP-5 (só testes) |
| P1-6 | Limitações documentadas da 5.2a invisíveis ao usuário (multi-instância, elisão esparsa, deepest-pick) | P1 | FIX-MP-6 (copy honesta) |
| P1-7 | Sem detecção de HMR morto → preview finge frescura | P1 | FIX-MP-7 (o tap já tem o socket; falta reportar close/error) |
| P2-8..14 | hydration→vermelho-fatal · testes mode-registry não-herméticos · 15 falhas cli Windows · shadow DOM no-op mudo · `#lp-status` sem `aria-live` · drift documental dos briefs · socket HMR engole erros | P2 | ver findings doc |

**Nota positiva do audit:** `esc()` consistente · origin-lock exato · path-traversal
guards · refusals nunca escrevem · fence anti-comentário inexpugnável · CRLF/emoji
byte-perfect · packaging `@babel/parser` blindado por teste. A fundação honesta é real.

**Provas manuais pendentes** (exigem humano no VS Code): gate 5.2a vivo, N1 blank-screen,
MP4 3 erros vivos, N5/N6 HMR morto, N8/N9 teclado+NVDA, N10 scroll, N14 porta alheia —
lista completa no findings doc.

---

## 5. Comboio de execução atual (2026-07-07)

**Fonte executável:** `_handoff/SUPER_WAVE_LP48_LP5_LP6.md` — masterprompts completos das
3 waves, com DO/GUARD/GATE e reviews adversariais focadas. Este roadmap não os duplica.

| Ordem | Wave | Estado | Gate humano |
|---|---|---|---|
| A | **LP-4.8** UX in-canvas + skills | 🔜 pronta a disparar | pin→toolbar · preset $0 · `/icon` insere logo GitHub local $0 · multi-select · Esc/Tab |
| B | **LP-5** 🛡 Security | 🔜 só após merge da A | findings reais + try-to-fix cercado (nunca auto-aplica) + Critical bloqueia publish |
| C | **LP-6** 🚀 Publish | 🔜 só após merge da B | commit seletivo provado no git diff · two-factor antes de qualquer deploy de produção |
| ∥ | **FIX-MP-1 (P0-1)** | ⚠️ recomendado ANTES do LP-6 tocar produção (o VISION já mandava o fix do A7 preceder o publish) | recusa honesta no cenário do incidente |

**Routing de modelo do comboio** (com os $50 de crédito, 2026-07-07): Sonnet = cavalo de
trabalho do código · Opus = arquitetura das peças difíceis + reviews adversariais ·
`@fable` = só se a quota de plano permitir, 1 momento de alto valor por wave, nunca
auto-routed · ❌ nunca construir estas waves em Haiku.

**Regras do comboio:** worktree própria nova off `origin/main` por wave · commits atômicos ·
wave N+1 só após merge da wave N · zero deps novas sem allowlist `.vscodeignore` +
`live-edit-packaging.test.js` · no fim: bump único do vsix + guia de instalação ·
NÃO rodar `/mooter-update` (nada em `tools/router/`).

**Depois do comboio (backlog ordenado):** FIX-MP-2..7 · LP-4.6 Context Pack (aguarda
decisões D1-D3) · MP5.3 área/marquee · LP-7 before/after renderizado.

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
