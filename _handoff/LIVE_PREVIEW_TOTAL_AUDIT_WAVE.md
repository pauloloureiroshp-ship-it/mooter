# WAVE LP-AUDIT — Auditoria TOTAL do Live Preview (validar cada feature · queixo caído)

> **Data:** 2026-07-06 · **Autor:** Cowork (Fable 5) · **Executor:** sessão CC dedicada
> **Natureza:** READ-ONLY na Fase 1-2 (zero edições de produto) → findings P0/P1/P2 → fixes SÓ em wave separada com OK do Paulo.
> **Sequência (actualizada 05:20):** a MP5.2a está construída (`wave/lp-mp5-2a` @9083ef3, gate mecânico verde, review adversarial em curso). **Correr esta auditoria SÓ DEPOIS de a 5.2a aterrar em main** — assim a worktree de auditoria já a inclui e valida o produto inteiro de uma vez. Fixes nunca em paralelo (R3).
>
> **Base de pesquisa deste brief:** confronto do código real em `origin/main` (GitHub raw, 2026-07-06) + pesquisa web ~34 fontes sobre a barra competitiva Jul-2026 (Lovable/Cursor/v0/Replit/Bolt/Onlook/Devin Desktop) e os modos de falha reais do mercado. Fontes no Anexo C.

---

## ⚠️ Fase 0 — Reconciliação de estado (ANTES de auditar; 15 min)

Descobertas do boot Cowork 2026-07-06 que a auditoria tem de confirmar nativamente:

| # | Descoberta | Evidência | Acção |
|---|---|---|---|
| 0.1 | **`~/frugal` está checked-out em `wave/honest-controls`, não em `main`** | `.git/HEAD` lido directo do mount; explica o vsix/estado local divergirem de main | `git status` nessa branch (há WIP?) → se limpo, `git switch main && git pull`; se sujo, triar antes. **Decisão do Paulo.** |
| 0.2 | **`package.json` da extensão: `main` diz `0.16.34`, working tree local diz `0.16.50`, handoff diz vsix `0.16.48`** | GitHub raw vs mount | Confirmar política de bump de versão (bump só no package local? nunca committado?) — se for acidente, registar como finding P2 |
| 0.3 | O vsix INSTALADO no VS Code do Paulo pode não ser o de main | incidentes anteriores (feature invisível sem Reload) | `code --list-extensions --show-versions | grep mooter` + reinstalar vsix de main + **Reload Window** antes de qualquer prova manual |
| 0.4 | classify.js sha | `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` confirmada hoje (mount + CI + gate 5.2a) | re-verificar no gate |
| 0.5 | **56 uncommitted em `~/frugal`** (handoff 5.2a marcou "⚠ tree trocado") | ruído de ambiente na branch `wave/honest-controls` — fora do HEAD da wave | triar junto com 0.1: lixo de ambiente → descartar; trabalho → commitar. Nunca deixar mascarar o estado real |
| 0.6 | **Limite Fable 5 atingido** (reset em 3d) | sessão 5.2a correu em Fable, `saved $-28.61` | auditoria corre em Opus (arquitectura) / Sonnet (execução) — doutrina normal; T5 era opt-in pontual, não é necessário para auditar |

## 🛡️ PROTOCOLO (R1–R6, adaptado a auditoria)
- R1: `git fetch && git worktree add ../frugal-audit origin/main` (detached, read-only); confirma `git rev-parse --show-toplevel`.
- Zero edições fora de `_handoff/`. `npm install` em `packages/cli` E `packages/router` (worktree fresca).
- Output único: `_handoff/LIVE_PREVIEW_AUDIT_FINDINGS.md`.

---

## Fase 1 — Matriz de auditoria por feature (executável, com âncoras)

Para CADA linha: (a) correr os testes automatizados do módulo; (b) prova manual no preview vivo (vsix de main + dev server 7819); (c) veredicto ✅/⚠️/❌ + evidência (output de teste, screenshot, git ref).

| Feature | SHA | Âncoras (confirmadas em main hoje) | Prova executável |
|---|---|---|---|
| **MP2 App Stage** | `c83e203` | `lp-stage.js::resolveStage/normalizeStageUrl/renderStageStatus` · iframe + CSP frame-src + origin-lock em `extension.js::getLivePreviewHtml` | dev server up → iframe renderiza; dev server DOWN → estado honesto (offline, não spinner infinito); porta alternativa (3000) → detector encontra; porta ocupada por outro processo → não mente |
| **Honest controls** | `05d3601` | atribuição por sessão (gitStage real) | 2 sessões CC a tocar ficheiros distintos → badges atribuídos à sessão certa; zero "unsaved" falso |
| **MP4+4.1 Diagnostics** | `266e4f3` | `lp-diagnostics.js` + `lp-error-tap.ts` (runtime+build+server-side, file:line) | lançar: (1) throw client, (2) erro de build (syntax), (3) erro SSR/API — os 3 aparecem no strip com file:line clicável; consola vazia de duplicados |
| **MP3.1 Relógio tz** | `a0f6618` | `live-preview-view.js::clock` — `toLocaleTimeString(undefined,{hour12:false})`; `ts==null`→`n/d` (confirmei o código em main) | evento às 08:29 SP mostra `08:29`; `ts` lixo → `n/d` (teste unitário existe — correr) |
| **MP3.3 Multi-page nav** | `567d419` | address bar + route picker + `lp-nav {path}` | Enter navega; clicar link dentro do site → host actualiza rota; back/forward; rota inexistente → 404 do Next visível (não ecrã branco) |
| **MP4-polish strip** | `1469f5f` | fatal vermelho vs aviso amarelo | warning benigno (ex: hydration warning) NÃO acende vermelho; fatal acende |
| **MP5.0 Source map** | `c2087c5` | `next.config.ts::codeInspectorPlugin({bundler:'webpack'})` só `dev===true` | `data-insp-path` presente em dev; `npm run build && start` → atributo AUSENTE em prod (dead-code provado) |
| **MP5.1 Select-to-edit** | `edf9bc4`→`cc05c85` | `lp-error-tap.ts §6` (hover/click→`lp-select`) · `live-edit-ast.js::applyDeterministicEdit` · chip `lpTier` | 🎯 on → hover highlight; click → painel com file:line certo; edit texto → HMR, `git diff` toca SÓ o span; edit class → idem; recusa honesta em `not-simple-text`/`dynamic-classname` (mostrar reason, nunca escrever) |
| **MP5.2a Select-lock** | `9083ef3` (5 commits, base cc05c85; confirmar SHA pós-merge) | `live-edit-ast.js::deleteNode/locateRange/spliceNodeRange` (aditivos) + breadcrumb/pin no tap e host — HEAD tocou 4 fich.: extension.js, live-edit-ast.js, live-edit-ast.test.js, webview-syntax.test.js | re-executar o gate 5.2a ao vivo COM o vsix novo instalado + Reload Window: click na img → moldura PRESA + breadcrumb `… › CrookOutline › img` (não pode aterrar no componente como antes) · 🗑 → mini-diff só a linha da img → aplicar → some, $0, git diff mínimo · Esc solta · baseline: extensão 635/635, landing 207/207 |

**Suites:** `cd packages/vscode-extension && npm test` (617+ esperados) · landing vitest · `cd packages/cli && npm test`. Colar contagens exactas no findings — nunca "passou tudo" sem números.

**⚠ Regra de ouro da Fase 1 (lição LP-3.2, 2026-07-06):** toda a prova manual corre com o **vsix INSTALADO** (`~/.vscode/extensions/`), nunca só com testes no worktree — o worktree tem `node_modules` hoisted que mascara dependências não embarcadas (o bug do `@babel/parser` estripado pelo `.vscodeignore` passou 641/641 nos testes e morreu na instalação real). Check obrigatório: `npx vsce ls --tree` → toda a dependência de runtime declarada no `package.json` tem de aparecer DENTRO do vsix; cruzar com os `require()` de `src/*.js` (o teste estático `live-edit-packaging.test.js` pina o contrato — confirmar que corre na suite).

---

## Fase 2 — Bateria negativa (os modos de falha REAIS do mercado como test cases)

Cada caso vem de uma falha documentada num concorrente (fontes no Anexo C). O Live Preview ganha o "queixo caído" não por ter mais features, mas por NUNCA mentir onde todos mentem.

| # | Caso (origem da dor) | Teste | Critério de honestidade |
|---|---|---|---|
| N1 | **Blank screen sem explicação** (queixa nº1 Lovable/Bolt) | app com runtime error que "blanka" o ecrã | strip diz O QUÊ e ONDE (file:line); nunca iframe branco mudo |
| N2 | **Non-200/redirect** (Cursor browser mostra erro Chrome genérico p/ 302/403/404 — forum.cursor.com/155271) | rota que devolve 302 p/ login, 403, 404 | iframe mostra a página real da app (login/404 dela), não um erro genérico do host |
| N3 | **Shadow DOM** (Cursor não seleciona lá dentro — forum/154916) | web component com shadow root na landing | select-mode: ou seleciona via `composedPath`, ou declara honestamente "não selecionável" — nunca seleciona o elemento errado em silêncio |
| N4 | **Inputs React controlados** (Cursor `browser_type` não dispara onChange — forum/141594) | form controlado dentro do preview | digitar DENTRO do iframe funciona normal (nós não sintetizamos input — validar que o tap não intercepta teclas fora do select-mode) |
| N5 | **Stale preview** ("preview fine, published broken") | editar ficheiro fora do editor (echo >> ) com HMR morto | preview marca stale/degraded, não finge frescura |
| N6 | **HMR websocket** (Vite/Next WS falha atrás de proxy) | confirmar hot-reload E2E dentro do webview (o gap `LIVE_PREVIEW_HOTRELOAD_TEST.md` ainda aberto) | reload automático <2s ou indicador honesto de reconexão |
| N7 | **Service workers** (não registáveis em webview iframes — vscode#194751) | app com SW registration | falha silenciosa do SW não parte o preview; se partir, strip explica |
| N8 | **Focus trap / teclado** (webviews são armadilhas de foco — vscode#203498) | Tab/F6/Esc com painel aberto; Esc sai do select-mode sem roubar o Esc do VS Code | navegável por teclado; Esc não engole atalhos globais |
| N9 | **Screen reader** (foco não acompanha webview — vscode#94229) | NVDA/Narrator sobre o painel | mínimo: ARIA labels nos controlos (🎯, address bar, strip); registar gaps como findings, não esconder |
| N10 | **DOM thrash / scroll reset** (finding herdado: `root.innerHTML` full-replace a cada snapshot 2-3s) | scroll no Director's Cut durante updates | scroll não salta; se saltar → finding P1 (diffing ou anchor) |
| N11 | **Edge cases do motor $0** | `applyDeterministicEdit` com: 2 elementos na mesma linha · className template-literal · texto com emoji/acentos (offsets UTF-16) · ficheiro CRLF | localiza o certo ou recusa; NUNCA splice no sítio errado; CRLF não corrompe |
| N12 | **Component scope / .map()** (limitação honesta §8 do handoff) | selecionar nó dentro de componente partilhado e dentro de `.map()` | aviso visível ("vive em X.tsx — afeta todos os usos") — se ausente, finding P1 |
| N13 | **Segurança do host** | nonce `Math.random()` (herdado) · origin-check de TODOS os postMessage handlers · escaping de `text/className` vindos do tap para o painel | nonce → crypto.randomBytes (finding se não); mensagem de origin errada é descartada; conteúdo do site nunca vira HTML no host sem esc() |
| N14 | **Porta/colisão** (Trail of Bits: portMapping + porta aleatória) | 2 dev servers, porta 7819 ocupada por app alheia | detector nunca liga o preview à app errada; origin-lock verifica |
| N15 | **Hardening 5.2a (majors da review adversarial — regressão proibida)** | (a) replacement com comentário `// pwned` → spliceNodeRange REJEITA; (b) editar o ficheiro fora do editor entre o mini-diff e o "aplicar" → host recusa `file-changed`, nunca escreve; (c) aviso component-scope NÃO dispara em nós próprios da página (falso positivo layout.tsx) | os 3 fixes têm teste no repo — correr + prova manual; limitações documentadas (elisão esparsa `[, <b/>]` em array literal · re-select multi-instância pinta 1ª · deepest-pick vs overlay não-carimbado) devem estar VISÍVEIS ao utilizador, não só no código |

---

## Fase 3 — Findings + saída

1. `_handoff/LIVE_PREVIEW_AUDIT_FINDINGS.md` com: tabela veredicto por feature · findings P0 (mente ao utilizador/segurança) / P1 (dor UX real) / P2 (polish) · evidência por finding (output, screenshot, file:line).
2. Para cada P0/P1: **masterprompt de fix pronto a colar** (1 worktree por fix wave, R1-R6), SEM executar.
3. **PÁRA no relatório.** Nenhum fix nesta wave. OK do Paulo decide a fix wave.

## 🔒 GUARD
Read-only no produto · classify.js FROZEN (sha acima) · zero `git add`/commit em código · output só `_handoff/` · PT-PT no chat, EN em identificadores · nunca inventar números — contagens de teste coladas do output real.

## ✅ GATE
Fase 0 reconciliada (branch/versões confirmadas nativamente) · matriz Fase 1 completa com veredictos + evidência · os 14 casos N1-N14 executados ou marcados "bloqueado porque X" (nunca saltados em silêncio) · findings priorizados com fix-masterprompts · sha intacta · `git status` da worktree limpo (nada tocado). Cola o findings inteiro.

---

## Anexo A — Findings já suspeitos (do confronto Cowork de hoje; a auditoria confirma/refuta)

| # | Suspeita | Fonte | Prioridade provável |
|---|---|---|---|
| A1 | A11y: zero ARIA no painel, tier-mix só por cor, emojis sem label | leitura de `live-preview-view.js` em main | P1 (WCAG + é diferenciador barato) |
| A2 | `root.innerHTML` full-replace a cada snapshot → thrash/scroll reset | idem (padrão MP1 mantido?) | P1 se reproduzível |
| A3 | Nonce CSP via `Math.random()` | `getLivePreviewHtml` (versão MP1; confirmar em main) | P2 (defense-in-depth) |
| A4 | `extension.js` LP host-side sem testes dedicados (snapshot/panel/watch) | auditoria de testes | P2 |
| A5 | Versões dessincronizadas 0.16.34 (main) vs 0.16.48/50 (local) | Fase 0.2 | P2 |
| A6 | Hook-collector ausente → painel vazio SEM aviso ao utilizador | leitura extension.js | P1 (viola honest-copy) |
| A7 | **CONFIRMADO ao vivo 2026-07-06 06:49 (P0): árvore do preview ≠ árvore de edição.** Workspace do VS Code = `~/frugal`; dev server na 7819 servia `../frugal-land-mp52a/landing`. Delete $0 aplicou com "✓ elemento apagado" mas escreveu no `~/frugal` — o preview nunca mudou. O host resolve o path do `data-insp-path` contra o workspace root, não contra a raiz que o server serve; o detector de porta (MP2) valida `localhost:porta`, nunca a identidade da árvore. Fix: amarrar edição à árvore servida (ou provar identidade: hash do source vs módulo servido) e, se impossível, recusar honesto "o preview não vem deste workspace". | prova viva desta sessão | **P0** (é a definição de preview que mente) |

## Anexo B — Barra competitiva Jul-2026: o que falta para o "uau" (candidatos MP6+, NÃO são findings)

A auditoria valida o que EXISTE. Isto é o mapa do que os outros shiparam Abr-Jun 2026 e nós não temos — para o Paulo priorizar depois:

| Wow do mercado | Quem | Nosso ângulo local-first |
|---|---|---|
| **Draw-annotation** sobre o preview (sketch → prompt) | Cursor Design Mode 05-jun · Lovable toolbar 10-jun | já planeado ≈ MP5.3 área/marquee — subir prioridade |
| **Multi-select relacional** ("faz este igual àquele") | Cursor 05-jun | extensão natural do lock+breadcrumb (MP5.2a) |
| **Drag handles** spacing/gap + reorder | v0 Design Mode | mapeia a edit determinístico $0 de classe Tailwind — fosso nosso |
| **Responsive/multi-device preview** | pedido ABERTO no forum Cursor (159275) — ninguém tem embebido | barato: viewport presets no iframe; ganho alto |
| **Version history visual + restore 1-click** | Bolt | temos git real por baixo — "undo destemido" honesto é nosso por natureza |
| **Self-testing visível** (agente testa e vês) | Replit Agent 3/4 · Lovable browser-testing 22-jun | = Moo Guardião do Preview (estudo já feito), local $0 |
| **Voz** | Cursor · Replit | Groq Whisper já no stack do Paulo — ponte possível |

Posição: ninguém oferece nada disto **local-first sobre o dev server real dentro do VS Code**. A queixa dominante do mercado (preview mente · erro escondido · doom loop · credit burn) é exactamente o que o trio error-strip honesto + $0 determinístico + chip router-native ataca. A auditoria existe para PROVAR que não mentimos em nenhum dos 14 modos de falha em que eles mentem.

## Anexo C — Fontes (verificadas 2026-07-06)
- Lovable changelog (toolbar 10-jun · browser testing 22-jun · preview errors 24-jun): docs.lovable.dev/changelog · visual edits $0: docs.lovable.dev/features/visual-edit · engenharia: lovable.dev/blog/visual-edits
- Cursor Design Mode 05-jun-2026: cursor.com/blog/design-mode · browser CDP: cursor.com/docs/agent/tools/browser · bugs: forum.cursor.com 155271/154916/141594/159275 · crítica: devclass.com 16-dez-2025
- v0 Design Mode: v0.app/docs/design-mode · Replit Agent 3 self-testing: blog.replit.com/automated-self-testing · Agent 4: replit.com/agent4 · Bolt "Pick from layers"/history: support.bolt.new/release-notes · Onlook: github.com/onlook-dev/onlook
- Queixas: nightlamp.app/guides/lovable-app-broken · support.bolt.new/troubleshooting/issues · getautonoma.com/blog/bolt-vs-lovable · softr.io/blog/replit-pricing · superdesign.dev/blog/v0-review
- Webview: code.visualstudio.com/api/extension-guides/webview · blog.trailofbits.com 2023/02/21 (portMapping) · vscode#194751 (SW) · #203498 (foco) · #94229 (screen reader) · vite.dev/guide/troubleshooting (HMR WS)
- Código real: raw.githubusercontent.com/pauloloureiroshp-ship-it/mooter/main — `live-edit-ast.js` (íntegro), `live-preview-view.js` (clock fix presente), `package.json` (0.16.34)
