# LIVE PREVIEW — AUDIT FINDINGS (Wave LP-AUDIT)

> **Data:** 2026-07-06 · **Base auditada:** `origin/main @2c1a492` (worktree detached `../frugal-audit`, read-only, `git status` limpo no fim)
> **Método:** arquitectura Opus-tier (sessão), execução 4× subagents Sonnet em paralelo (suites · segurança/honestidade · motor $0 executável · âncoras/trace A7). Zero edições de produto. Output único = este ficheiro.
> **classify.js sha:** `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` — verificada em `~/frugal`, `origin/main` e na worktree de auditoria ✅

**TL;DR:** O produto NÃO mente nos sítios onde os concorrentes mentem — esc()/origin-lock/refusals honestos/empty-states confirmados com evidência. Mas o **A7 é P0 confirmado por trace de código + evidência forense viva**: a edição $0 não tem nenhuma noção de "que árvore é que o dev server serve", e o incidente de 06:49 deixou rasto físico (`landing/app/page.tsx` em `~/frugal` com a linha `<CrookOutline size={48} />` apagada, uncommitted). 1×P0 · 6×P1 · 7×P2. Suites: extensão **646/646** (re-run limpo), landing **207/207**, cli 637/653 (15 falhas pré-existentes de ambiente Windows). Motor $0: **7/7 edge cases executados ao vivo, todos honestos**.

---

## Fase 0 — Reconciliação de estado (executada 2026-07-06 ~07:1x)

| # | Item do brief | Resultado nativo | Estado |
|---|---|---|---|
| 0.1 | `~/frugal` em `wave/honest-controls`, não em `main` | Branch confirmada, **mas aponta exactamente para `2c1a492` = `origin/main`** — zero divergência de commits. Auditoria correu em worktree própria; nenhuma mudança de branch necessária. | ✅ resolvido |
| 0.2 | Versões 0.16.34 (main) vs 0.16.48/50 | **Stale.** Hoje: local `0.16.49` = `origin/main` `0.16.49`. A5 do Anexo A fica **refutada**. | ✅ refutado |
| 0.3 | vsix instalado pode não ser o de main | `code --list-extensions --show-versions` → `mooter.mooter-cockpit@0.16.49` = main. Reinstalação desnecessária; **Reload Window continua recomendado antes de prova manual**. | ✅ |
| 0.4 | classify.js sha | `427d8c0b…4bc48f` confirmada em 3 sítios (local, origin/main, worktree). | ✅ intacta |
| 0.5 | 56→62 uncommitted em `~/frugal` | 62 entradas: ~57 untracked em `_handoff/` + 4 docs novos em `docs/` + **1 ficheiro de produto modificado: `landing/app/page.tsx`** — o diff é exactamente a linha `<CrookOutline size={48} />` apagada = **rasto forense do incidente A7** (o delete $0 desviado). Triagem = decisão do Paulo (restaurar com `git checkout -- landing/app/page.tsx` ou manter). A auditoria não tocou. | ⚠ triagem pendente (Paulo) |
| 0.6 | Limite Fable | Auditoria correu na doutrina normal: arquitectura na sessão, execução em 4 subagents Sonnet. | ✅ |

**Estado do dev server no momento da auditoria:** porta 7819 LISTENING (PID 58072), a servir `C:\Users\Paulo Loureiro\frugal\landing` (workspace actual). O alinhamento preview↔edição de AGORA é **coincidência de restart, não garantia** — ver P0-1. Consequência visível: a linha apagada pelo incidente está agora **visível no preview** (hero sem o ícone Crook).

---

## Fase 1 — Matriz de veredictos por feature

Legenda: **Código** = âncoras + comportamento verificados por leitura/teste na worktree · **Manual** = prova viva no webview (requer humano; ver checklist no fim).

| Feature | SHA | Veredicto código | Evidência (file:line em main @2c1a492) | Manual |
|---|---|---|---|---|
| **MP2 App Stage** | c83e203 | ✅ | `lp-stage.js:77-364` (resolveStage/normalizeStageUrl/renderStageStatus) · CSP `frame-src http://localhost:* …` em `extension.js:1567` · offline honesto: `applyStage()` `extension.js:1736-1756` esconde iframe e mostra `#lp-degrade` com `stage.reason` real — sem spinner infinito | bloqueado (webview) |
| **Honest controls** | 05d3601 | ✅ | `row-renderer.js:98-125` — `deriveStages(gitStage, branch, attr)` com `attr.unsavedOwn = touchedFiles ∩ gitStage.files`; tree sujo sem unsaved próprio → nível `'repo'` (facto, não claim). Regressão "8+ badges, 0 code to save" pinada em `honest-controls.test.js` | bloqueado (2 sessões CC) |
| **MP4+4.1 Diagnostics** | 266e4f3 | ✅ | Runtime: `lp-error-tap.ts:251-278` (error+unhandledrejection, `parseStackForSource` → file:line) · Build: overlay MutationObserver `:303-344` **+** socket HMR próprio a ler `errors[]` `:355-388` · Server-side: `LpBoundaryReport.tsx` via error boundary (`buildBoundaryErrorPayload` `:140-171`) — os 3 canais existem | bloqueado (3 erros vivos) |
| **MP3.1 Relógio tz** | a0f6618 | ✅ | `live-preview-view.js:160-165` — `ts==null → 'n/d'`, `toLocaleTimeString(undefined,{hour12:false})`. Testes correram e passaram: `live-preview-view.test.js:144` (São Paulo) e `:159` (n/d honesto) — dentro dos 646/646 | n/a (unit cobre) |
| **MP3.3 Multi-page nav** | 567d419 | ✅ | Address bar+picker `extension.js:1783-1805` · `lp-nav` `:1306-1318,2070` · rota inexistente → **404 real da app** (não há probe HTTP em todo o extension.js; `navFrameTo` `:1773-1782` só faz `frame.src=url` após origin-check) | bloqueado (back/forward) |
| **MP4-polish strip** | 1469f5f | ⚠ | Classificação em `lp-diagnostics.js:58-73` (`isBenignCssWarning` só apanha frases CSS). **Hydration mismatch logado como `Error` real → classifica `runtime` → vermelho fatal** — não há regra de demoção hydration (ver P2-8; pode subir a P1 se prova manual confirmar) | necessário (hydration vivo) |
| **MP5.0 Source map** | c2087c5 | ✅ | `landing/next.config.ts:60-65` — `if (dev) { config.plugins.push(codeInspectorPlugin(…)) }` — dead-code em prod por construção | opcional (build prod) |
| **MP5.1 Select-to-edit** | edf9bc4→cc05c85 | ⚠ | Cadeia completa ✅: tap `lp-error-tap.ts:511-536` → `lp-select` → `applyDeterministicEdit` call site `extension.js:1430` → chip `lpTier` `:2018-2036` → refusals honestos mapeados `:2038-2052`, nenhum caminho de recusa escreve. **MAS: `_applyEdit` (`:1412-1436`) não tem fence de staleness — ver P1-2** | bloqueado (HMR+git diff vivo) |
| **MP5.2a Select-lock** | 9083ef3→merge 78dd9da | ⚠ | `deleteNode/locateRange/spliceNodeRange` aditivos `live-edit-ast.js:169-239` ✅ · breadcrumb/pin tap `lp-error-tap.ts:427-566` + host `extension.js:1906-1946` ✅ · fence anti-comentário testado ✅ · fence stale do delete testado ✅ · **componente-scope SEM teste comportamental (P1-5)** · **limitações não visíveis ao user (P1-6)** · claim "4 ficheiros" do brief é falso: o merge `78dd9da` tocou **6** (inclui `lp-error-tap.ts` + `lp-error-tap.test.ts`) | necessário (gate 5.2a vivo) |

**Suites (números exactos, colados do output):**
- `packages/vscode-extension` `npm test`: run 1 `tests 646, pass 643, fail 3` → re-run imediato **`tests 646, pass 646, fail 0`**. As 3 falhas são flakiness de hermeticidade — os testes de `mode-registry` lêem/escrevem o ficheiro **real** `~/.claude/tools/router/.mooter-sessions.json` e correm à corrida com sessões Mooter vivas nesta máquina (ver P2-9). Baseline do brief (635) estava stale; total real em main é 646.
- `landing` `npx vitest run`: **`Test Files 32 passed (32) · Tests 207 passed (207)`** — bate o baseline exacto.
- `packages/cli` `npm test`: `tests 653, pass 637, fail 15, skipped 1` — as 15 são **pré-existentes de ambiente Windows** (chmod 0600→0666, `HOME` vs `os.homedir()`, ENOENT em tmp), zero relação com Live Preview; análogo do baseline já documentado do `packages/router` (ver P2-10).

**Packaging (lição LP-3.2):** `npx @vscode/vsce ls --tree` → `node_modules/@babel/parser/**` **dentro** do vsix ✅. Cross-check de todos os `require()` externos em `src/*.js`: a única dependência runtime externa é `@babel/parser`, declarada em `dependencies` ✅. Contrato pinado por `live-edit-packaging.test.js` (5/5 a correr na suite, incluindo o teste que verifica a negação `!node_modules/@babel/parser/**` no `.vscodeignore`) ✅.

---

## Fase 2 — Bateria negativa N1–N15

| # | Caso | Estado | Resultado |
|---|---|---|---|
| N1 | Blank screen | **bloqueado** — exige erro runtime vivo no webview | Mecanismo verificado estaticamente: tap captura + strip com file:line (`lp-error-tap.ts:251-278`, `lp-diagnostics.js:268-279` com `esc()`); prova viva pendente |
| N2 | Non-200/redirect | **executado (estático)** ✅ | Não existe probe HTTP no host — o iframe recebe e renderiza a resposta real da app (302/403/404 dela, nunca erro genérico do host). `extension.js:1766,1780` |
| N3 | Shadow DOM | **executado (estático)** ⚠ | Sem `composedPath()` no repo (grep global); `resolve()` usa `elementsFromPoint` (`lp-error-tap.ts:479-484`) → nó em shadow root é inatingível. Não seleciona o elemento errado (no-op silencioso, sem preventDefault), mas também **não declara "não selecionável"** → P2-11 |
| N4 | Inputs React controlados | **executado (estático)** ✅ | Listeners de select-mode só são registados em `set(true)` e removidos em `set(false)` (`lp-error-tap.ts:573-589`); observadores always-on são passivos, zero preventDefault/stopPropagation em input/click/focus |
| N5 | Stale preview | **executado (estático)** ❌ | Único sinal de frescura = liveness TCP (`lp-stage.js:216-222`). HMR morto / ficheiro mudado fora do watch → preview **finge frescura**. → P1-7 |
| N6 | HMR websocket | **parcial** ⚠ | CSP do host não bloqueia o WS do iframe (sem `connect-src`; frame-src não cascata para dentro do iframe cross-origin) ✅. Mas não há indicador de reconexão, e o socket HMR do tap engole erros em silêncio (`lp-error-tap.ts:384`). E2E hot-reload no webview (gap `LIVE_PREVIEW_HOTRELOAD_TEST.md`) continua **aberto** → dentro de P1-7 |
| N7 | Service workers | **executado** ✅ | Zero registo/dependência de SW em `landing/` e no tap/host (greps nomeados) — vscode#194751 não é implicado |
| N8 | Focus trap / Esc | **executado (estático)** ✅ | Esc no tap sai do select-mode SEM preventDefault/stopPropagation (`lp-error-tap.ts:567-577`); isolamento iframe→host impede estruturalmente engolir o Esc do VS Code; sem focus-steal no host. Prova de teclado viva pendente |
| N9 | Screen reader | **bloqueado** — NVDA/Narrator é prova humana | Audit ARIA estático feito: controlos com `aria-label`/`aria-pressed` (`extension.js:1690-1697`), severidade nunca só-cor (emoji+texto, `lp-stage.js:236-249`, `lp-diagnostics.js:259`). 1 gap: `#lp-status` sem `role="status"`/`aria-live` → P2-12 |
| N10 | DOM thrash / scroll | **executado (estático)** ❌ | Stream do Director's Cut (`overflow:auto`) leva `innerHTML` full-replace a cada 7s (`extension.js:1727`) **sem** save/restore de scroll — e o Cockpit já resolveu isto no mesmo ficheiro (`:3548-3552`, fix B2). → P1-4 |
| N11 | Edge cases motor $0 | **EXECUTADO AO VIVO** ✅ 7/7 | Harness em scratchpad com cópia sha-idêntica de `live-edit-ast.js` + `@babel/parser`: same-line siblings→acerta no 2º; template-literal→`dynamic-classname`; emoji+acentos→byte-perfect; CRLF→preservado sem desvio; `// pwned`+`/* pwned */`→`replacement-has-comments`; nested→`not-simple-text`; deleteNode→linha removida limpa, output re-parseia. Output verbatim no report do agent |
| N12 | Component scope / .map() | **executado (estático)** ✅ | Warnings visíveis no painel: shared-component `extension.js:1936-1938` + repetido/.map() `:1942` + `inExpr` no delete `:1996` (`isInsideExpression` `live-edit-ast.js:245-267`). MAS a lógica do false-positive não tem teste → P1-5 |
| N13 | Segurança host | **executado (estático)** ⚠ | `esc()` em TODOS os render sites de dados do tap ✅ (enumerados) · origin-lock iframe: source+origin exactos `extension.js:2065-2067` ✅ · validação de shape+containment+realpath nos handlers do lado extensão ✅ · **nonce CSP e HOST_TOKEN via `Math.random()`** ❌ → P1-3 |
| N14 | Porta/colisão | **executado (estático)** ❌ | Detecção = TCP connect puro (`extension.js:1176-1192`, `lp-stage.js:128-228`), zero verificação de identidade → app alheia na 7819 é adoptada. Mesmo root cause do P0-1 |
| N15 | Hardening 5.2a | **executado** ⚠ | (a) fence comentários: teste `live-edit-ast.test.js:198` ✅ + harness ✅ · (b) file-changed: delete FAIL-CLOSED testado `lp-delete-host.test.js:64,92` ✅, **edit path SEM fence** ❌ (P1-2) · (c) component-scope: lógica presente com comentário do fix, **teste negativo inexistente** ❌ (P1-5) · limitações documentadas: 1 de 3 sem qualquer surface ao user, 1 parcial (P1-6) |

---

## FINDINGS

### P0 — o preview que mente

**P0-1 · Edição $0 não está amarrada à árvore que o preview serve (A7 CONFIRMADO + N14)**
- **Mecanismo (trace completo):** `data-insp-path` absoluto é usado verbatim; relativo é joined a `_wsRoot()` = workspace do VS Code (`extension.js:1389/1420/1457`, `_wsRoot` `:1230-1232`). O único gate é *containment* no workspace (`path.relative` + `realpathSync`) — necessário mas **insuficiente**: nunca pergunta "o dev server na `stage.port` serve ESTA árvore?". A detecção de porta é TCP-connect puro, sem uma única request HTTP em todo o `extension.js`. O fence sha256 do delete (`:1467-1473`) só protege contra o ficheiro mudar **no mesmo disco** — não diz nada sobre o disco ser o certo.
- **Evidência forense:** incidente 2026-07-06 06:49 — workspace `~/frugal`, server 7819 a servir `../frugal-land-mp52a/landing`; delete reportou `"✓ elemento apagado — $0"` (string do caminho de sucesso `extension.js:2042`, i.e. `fs.writeFileSync` correu, `:1486`) e escreveu em `~/frugal`; o preview nunca mudou. O rasto continua no disco: `git diff landing/app/page.tsx` em `~/frugal` = exactamente `- <CrookOutline size={48} />`. Como as duas worktrees são do mesmo repo com layouts relativos gémeos, o path resolve para um ficheiro real e contained — passa tudo, escreve na árvore errada.
- **Porque é P0:** é a definição literal de "preview que mente" — o produto inteiro existe para nunca fazer isto.
- **Fix:** ver FIX-MP-1.

### P1 — dor real / superfície de segurança

**P1-2 · Fence de staleness assimétrico: delete protegido, edit não**
`_deleteNode` é FAIL-CLOSED com sha256 preview→apply (`extension.js:1466-1483`, testado em `lp-delete-host.test.js:64,92`). `_applyEdit` (`extension.js:1412-1436`) lê o ficheiro e **escreve incondicionalmente** — se o ficheiro mudou entre a selecção e o apply, o splice aterra por line:col stale. Assimetria não testada nem documentada. → FIX-MP-2.

**P1-3 · Nonce CSP e HOST_TOKEN gerados com `Math.random()`**
`extension.js:1556` (nonce LP), `:2139` (nonce Cockpit) e — pior — `:1216`: `this.token = 'lp'+String(Math.random()).slice(2)+…` é o **segredo de autenticação** host→webview (`m.__t !== HOST_TOKEN` `:2086`); adivinhável → forjar `lp-goto`/`lp-edit`/`lp-delete`. `crypto` já está required na linha 23 e usado em `:1471` — o fix é 1 linha ×3. → FIX-MP-3.

**P1-4 · Director's Cut: `innerHTML` full-replace a cada 7s sem restauro de scroll (A2 confirmada, N10)**
`dcEl.innerHTML = renderDirectorsCut(…)` `extension.js:1727`, poll 7s (`data.js:111`), zero save/restore — enquanto o Cockpit no MESMO ficheiro já tem o fix (comentário B2, `:3548-3552`). Ler o stream durante updates = perder o scroll de 7 em 7 segundos. → FIX-MP-4.

**P1-5 · Fix do component-scope false-positive NÃO tem teste comportamental (contradiz o brief)**
A wave 5.2a afirmava "os 3 fixes têm teste no repo" — falso para este: a lógica `parentCrumb.file !== sel.file` (`extension.js:1936-1939`, com o comentário do fix layout.tsx) só é coberta por um assert de **presença de string** no HTML (`webview-syntax.test.js:84-95`). Nem o ramo positivo nem o negativo (nó próprio da página → warning NÃO dispara) são exercidos. Regressão silenciosa = UI a mentir (gritar em tudo, ou calar-se em componentes partilhados). Confirmado independentemente por 2 agents. → FIX-MP-5.

**P1-6 · Limitações documentadas da 5.2a não estão visíveis ao utilizador (N15)**
Critério do brief: "devem estar VISÍVEIS ao utilizador, não só no código". Estado: elisão esparsa `[, <b/>]` — **zero** surface UI; deepest-pick vs overlay não-carimbado — **zero**; re-select multi-instância pinta a 1ª — parcial (o warning `×N — afeta TODOS os itens` `extension.js:1942` existe, mas o framing "pinada à PRIMEIRA instância" só vive em comentário `:1940-1941`). → FIX-MP-6.

**P1-7 · Sem detecção de HMR morto / conteúdo stale (N5+N6)**
Única noção de frescura = porta TCP viva. HMR WS morto → edits param de reflectir e o preview **finge frescura** (a queixa "preview fine, published broken" do mercado). Ironia: o tap JÁ abre um socket HMR próprio (`lp-error-tap.ts:355-388`) — mas engole `error` em silêncio (`:384`) e não reporta `close`. → FIX-MP-7.

### P2 — polish / dívida

| # | Finding | Evidência | Nota |
|---|---|---|---|
| P2-8 | Hydration mismatch classificaria vermelho-fatal (MP4-polish ⚠) | `lp-diagnostics.js:58-73` só demove frases CSS; hydration `Error` real → `runtime`→vermelho | Prova manual decide; se confirmar, sobe a P1 (falso alarme fatal corrói confiança) |
| P2-9 | Testes `mode-registry` não-herméticos — escrevem no `~/.claude/tools/router/.mooter-sessions.json` REAL | 3 flaky em `data.test.js:1249,1278,1312` (WCOCKPIT-7/9); re-run limpo 646/646 | Fix: tmpdir por teste |
| P2-10 | `packages/cli` 15/653 falhas Windows pré-existentes | chmod 0600→0666, `HOME` vs `os.homedir()`, ENOENT tmp — lista verbatim no report do agent de suites | Análogo do baseline do router; registar, não é LP |
| P2-11 | Shadow DOM: no-op silencioso sem mensagem "não selecionável" (N3) | `lp-error-tap.ts:479-484`, sem `composedPath()` no repo | Honesto seria declarar; nunca seleciona o errado |
| P2-12 | `#lp-status` sem `role="status"`/`aria-live` | `extension.js:1688` (contraste: `#lp-error` tem `role="alert"` `:1699`) | Único gap ARIA real — resto do painel está acima do suspeitado |
| P2-13 | Drift documental do brief/handoffs | Baseline "635/635" → real 646 · "5.2a tocou 4 ficheiros" → merge `78dd9da` tocou **6** · A5 versões → refutada | Corrigir nos handoffs na próxima wave |
| P2-14 | Socket HMR do tap engole erros silenciosamente | `lp-error-tap.ts:384` | Absorvido pelo FIX-MP-7 |

### Suspeitas do Anexo A — desfecho

| # | Suspeita | Desfecho |
|---|---|---|
| A1 | Zero ARIA, tier só por cor | **Refutada no grosso** — aria-labels presentes, severidade nunca só-cor; sobra P2-12 |
| A2 | innerHTML thrash | **Confirmada** → P1-4 |
| A3 | Nonce Math.random | **Confirmada e agravada** (HOST_TOKEN idem) → P1-3 (era P2 no brief) |
| A4 | extension.js LP sem testes dedicados | **Parcialmente refutada** — `lp-delete-host.test.js`, `webview-syntax.test.js`, `live-edit-packaging.test.js` existem; os buracos reais são P1-2 e P1-5 |
| A5 | Versões dessincronizadas | **Refutada** — tudo 0.16.49 |
| A6 | Painel vazio sem aviso | **Refutada** — empty-states honestos (`live-preview-view.js:186-187`, `renderBrain` n/d, `renderStageStatus` com reason) |
| A7 | Árvore preview ≠ árvore edição | **CONFIRMADA** → P0-1 |

### Nota positiva (para não auditar só a sombra)
`esc()` consistente em todos os render sites de dados do site · origin-lock source+origin exacto · path-traversal/symlink guards em todos os handlers de ficheiro (`path.relative` + `realpathSync` pós-resolução) · refusal-paths nunca escrevem · empty-states honestos · fence anti-comentário inexpugnável no harness · CRLF/emoji byte-perfect · packaging @babel/parser blindado por contrato de teste. A fundação honesta é real.

---

## FIX MASTERPROMPTS (prontos a colar · 1 worktree por wave · NENHUM executado)

### FIX-MP-1 — P0-1 · Amarrar a edição $0 à árvore servida (tree-identity)
```
Wave FIX-LP-P0-TREEID — worktree própria, R1-R6.
git fetch && git worktree add ../frugal-fix-treeid origin/main && cd ../frugal-fix-treeid
npm install em packages/cli, packages/router, packages/vscode-extension, landing.

PROBLEMA (evidência: _handoff/LIVE_PREVIEW_AUDIT_FINDINGS.md P0-1):
data-insp-path resolve contra _wsRoot() (extension.js:1389/1420/1457) com containment-only;
detecção de porta é TCP puro (extension.js:1176-1192, lp-stage.js:128-228). Nada liga
"árvore que o server compila" ↔ "árvore onde o host escreve". Incidente real 06:49.

FIX (2 gates, ambos, defesa em profundidade):
G1 identidade na detecção: em dev, o tap conhece a raiz do projecto compilado — expor um
   marcador do lado servido (ex.: injectar NEXT_PUBLIC_LP_ROOT=process.cwd() dev-only no
   next.config.ts, lido pelo tap e enviado no handshake lp-hello/lp-select), OU probe HTTP
   dev-only. O host compara contra _wsRoot() (realpath-normalizado, worktree-aware).
   Mismatch → stage degraded HONESTO: "o preview na porta X não vem deste workspace (serve Y)".
G2 write-time: _openSourceFile/_applyEdit/_deleteNode recusam com reason
   'preview-tree-mismatch' quando a identidade não está confirmada — mensagem no painel via
   o map de showEditResult (extension.js:2038-2052). FAIL-CLOSED: sem identidade provada,
   não escreve.
Atenção: worktrees do mesmo repo têm paths gémeos — a comparação é de RAIZ ABSOLUTA
realpath'd, nunca de path relativo. Cobrir: workspace multi-root, server iniciado noutra
worktree, porta alheia (N14 — resolve-se de graça com G1).

TESTES: unit para G1 (match/mismatch/ausente→degraded) + G2 (recusa fail-closed, nada
escrito) + regressão do cenário do incidente (mock de duas árvores gémeas). Suites completas:
extensão 646+/greens, landing 207/207. Prova manual: repetir o incidente (server em
../frugal-land-mp52a, workspace ~/frugal) → tem de RECUSAR com mensagem honesta.
GATE: final-reviewer obrigatório · classify.js sha 427d8c0b…4bc48f intacta · adds selectivos ·
zero mudanças fora do escopo (extension.js, lp-stage.js, next.config.ts, lp-error-tap.ts, testes).
```

### FIX-MP-2 — P1-2 · Fence de staleness simétrico no _applyEdit
```
Wave FIX-LP-EDIT-FENCE — worktree própria, R1-R6.
git fetch && git worktree add ../frugal-fix-editfence origin/main

PROBLEMA: _deleteNode tem fence sha256 preview→apply FAIL-CLOSED (extension.js:1466-1483,
testado lp-delete-host.test.js:64,92); _applyEdit (extension.js:1412-1436) escreve
incondicionalmente com line:col potencialmente stale.

FIX: replicar o padrão do delete no fluxo de edit — sha256 do source no momento da selecção
(lp-select → painel), eco do hash no lp-edit, mismatch → recusa 'file-changed' + painel
regenerado com aviso stale (mesma copy honesta do delete). FAIL-CLOSED.
TESTES: espelhar lp-delete-host.test.js para o edit path (stale→nada escrito; fresh→escreve;
sem hash→bad-request). Suites completas verdes.
GATE: final-reviewer · sha frozen · adds selectivos · escopo: extension.js + testes.
```

### FIX-MP-3 — P1-3 · crypto.randomBytes para nonce + HOST_TOKEN
```
Wave FIX-LP-RNG — worktree própria, R1-R6. Escopo cirúrgico: extension.js:1216, :1556, :2139.
Trocar String(Math.random()).slice(2) por crypto.randomBytes(16).toString('hex')
(crypto já required na :23). 3 linhas + teste a assegurar formato/entropia mínima e que o
handshake HOST_TOKEN continua a funcionar (webview-syntax.test.js).
GATE: final-reviewer · sha frozen · suites verdes · adds selectivos.
```

### FIX-MP-4 — P1-4 · Scroll estável no Director's Cut
```
Wave FIX-LP-DC-SCROLL — worktree própria, R1-R6.
PROBLEMA: extension.js:1727 innerHTML full-replace a cada 7s sem save/restore; o padrão fix
já existe no MESMO ficheiro (B2, extension.js:3548-3552).
FIX mínimo: capturar/restaurar scrollTop de .lpdc-stream (e #lp-brain se aplicável) à volta
do re-render — OU (melhor, se barato) diffing por chave de evento. Não redesenhar o rail.
TESTE: unit ao helper de preservação; prova manual: scroll a meio do stream durante 3 polls
→ posição mantém. GATE: final-reviewer · sha frozen · suites verdes.
```

### FIX-MP-5 — P1-5 · Teste comportamental do component-scope warning
```
Wave FIX-LP-SCOPE-TEST — worktree própria, R1-R6. SÓ TESTES (zero mudança de produto).
Carregar o inline script do host com o padrão vm/parseInlineScript já usado em
webview-syntax.test.js e exercer a renderização da selecção com fixtures:
 (a) parentCrumb.file !== sel.file → div .lp-sel-warn PRESENTE ("afeta todos os usos");
 (b) parentCrumb.file === sel.file (nó próprio da página) → warning AUSENTE (o fix layout.tsx);
 (c) sel.repeated>1 → warning ×N presente.
GATE: final-reviewer · sha frozen · suite extensão verde com os novos testes.
```

### FIX-MP-6 — P1-6 · Limitações 5.2a visíveis ao utilizador
```
Wave FIX-LP-LIMITS-COPY — worktree própria, R1-R6. Copy honesta, PT-PT, cirúrgica:
 (a) multi-instância: acrescentar ao warning ×N (extension.js:1942) o facto "a moldura está
     presa à 1ª instância";
 (b) elisão esparsa em array literal: quando deleteNode elide num array (detectável no motor),
     nota no mini-diff;
 (c) deepest-pick vs overlay não-carimbado: tooltip/nota no painel de selecção.
NUNCA prometer o que o motor não faz. Testes de presença de copy (padrão webview-syntax) +
actualizar handoff. GATE: final-reviewer · sha frozen · suites verdes.
```

### FIX-MP-7 — P1-7 · Indicador honesto de HMR morto / stale
```
Wave FIX-LP-HMR-HONEST — worktree própria, R1-R6.
O tap JÁ tem um socket HMR (lp-error-tap.ts:355-388) que hoje engole erros (:384).
FIX: em close/error do socket → post {type:'lp-hmr-down'} ao host → chip/strip honesto
"hot-reload desligado — o preview pode estar stale" + tentativa de reconexão com estado
visível; em reconexão → limpar. Fecha também o gap E2E do LIVE_PREVIEW_HOTRELOAD_TEST.md:
guião manual de prova (matar/reviver o dev server, editar com HMR morto).
TESTES: unit ao handler do tap (mock WebSocket) + host render do estado degradado.
GATE: final-reviewer · sha frozen · suites verdes · adds selectivos.
```

---

## Provas manuais pendentes (bloqueadas nesta sessão — exigem humano no VS Code)

Pré-requisito único: Reload Window (vsix 0.16.49 já é o de main). Dev server 7819 já vivo a servir `~/frugal/landing`.

1. **Gate 5.2a vivo:** click na img → moldura presa + breadcrumb `… › CrookOutline › img` · 🗑 → mini-diff só a linha → aplicar → some, git diff mínimo · Esc solta. (⚠ nota: a img Crook está agora AUSENTE do hero por causa do P0-1 — restaurar `landing/app/page.tsx` primeiro se quiseres reproduzir o guião original.)
2. **N1:** provocar throw client → strip com file:line, nunca iframe branco mudo.
3. **MP4:** os 3 erros (client/build/SSR) ao vivo + **P2-8**: hydration warning benigno → confirmar se acende vermelho (decide P1 vs P2).
4. **N2 vivo:** rota 404/302 → página real da app no iframe.
5. **N5/N6 vivo:** matar HMR → confirmar que hoje NADA sinaliza stale (evidência viva do P1-7); reload <2s quando vivo.
6. **N8/N9:** Tab/F6/Esc + NVDA sobre o painel.
7. **N10 vivo:** scroll no Director's Cut durante 3 polls → confirmar salto (evidência viva do P1-4).
8. **Honest controls:** 2 sessões CC em ficheiros distintos → badges certos.
9. **N14 vivo:** app alheia na 7819 → confirmar adopção cega (evidência viva do P0-1/N14).

---

## GATE da auditoria — self-check

- [x] Fase 0 reconciliada nativamente (branch/versões/vsix/sha/uncommitted)
- [x] Matriz Fase 1 completa com veredictos + evidência file:line e contagens exactas coladas
- [x] N1–N15: 10 executados (7 estáticos + N7 + N11 vivo em harness + N15 misto), 5 bloqueados **com razão explícita** (N1, N9 e componentes vivos de N5/N6/N8) — nenhum saltado em silêncio
- [x] Findings priorizados 1×P0 · 6×P1 · 7×P2, cada um com evidência; fix-masterprompts para todos os P0/P1
- [x] classify.js sha `427d8c0b…4bc48f` intacta (local + origin/main + worktree)
- [x] `git status` da worktree de auditoria: **0 entradas** (nada tocado); em `~/frugal` só este ficheiro novo em `_handoff/`
- [x] Zero fixes executados. **A auditoria PÁRA aqui.** Fix waves dependem de OK do Paulo.

*Worktree `../frugal-audit` fica no disco com node_modules instalados — reutilizável pelas fix waves; remover com `git worktree remove ../frugal-audit` se preferires.*
