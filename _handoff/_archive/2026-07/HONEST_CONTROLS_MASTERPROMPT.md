# ⇄ COWORK→CC · Wave HONEST-CONTROLS — os botões têm de dizer a verdade

Data: 2026-07-04 · Origem: Cowork (investigação código-confrontada) · Prioridade: alta (Cockpit & UX, a seguir ao Deck Polish)

---

## GOAL

Matar os falsos positivos `⚠️ unsaved` / `Save my work` do cockpit e garantir que TODOS os botões/badges (a) refletem a realidade e (b) disparam uma acção real e útil. Honest-copy estendida dos números aos controlos: um badge só existe se for verdadeiro E útil.

## CONTEXTO — a causa-raiz REAL (difere do briefing original; confrontada com o código)

O briefing dizia "o cockpit deriva unsaved do journal congelado". **FALSO** — o código já lê git real:

- `host-extra.js:657 gitStage(cwd)` corre `git status --porcelain` real, async, 3s timeout. ✅ já é git.
- O bug é de **ATRIBUIÇÃO + AGREGAÇÃO**, não de fonte:
  1. **Broadcast da árvore partilhada** — `host-extra.js:1054-1058`: `row.gitStage = gitStage(cwd)` com `gsCache` por cwd. Todas as N sessões com `cwd=~/frugal` herdam o dirty da MESMA árvore. 1 árvore com 3 ficheiros meta sujos (SYNC.md, package.json, `_handoff/*.md`) → N sessões a gritar "unsaved". Provado 2026-07-04: 8+ badges, 0 código por salvar.
  2. **Inbox conta sessões, não repos** — `extension.js:2595 renderInbox`: `unsaved = rows.filter(dirty>0).length` → "⚠️ 8 unsaved" quando a verdade é "1 repo · 3 ficheiros meta".
  3. **Copy mente sobre causalidade** — `row-renderer.js:76 + :400`: "The AI changed your files — nothing saved yet" afirma que ESTA sessão mudou os ficheiros. Não há qualquer atribuição por sessão.
  4. **`deriveStages` amber indiscriminado** — `row-renderer.js:87-105`: `dirty>0` → safe amber `unsaved work` + CTA `Save my work` em cada row, mesmo quando o dirty é SYNC.md do repo partilhado.
- O journal (`sessionGitFromJournal`, host-extra.js:2293) só guarda `head/branch` — NÃO guarda ficheiros tocados. A atribuição por sessão tem de vir do **transcript** (tool_use `Edit`/`Write` → `input.file_path`): o parsing desse campo JÁ existe em `host-extra.js:1151` (extractPending), e o tail de 1MB já é lido uma vez por sessão em `recentSessions` (:984-988) — recolher os paths é o MESMO passe, custo ~zero.

## WHERE

- `packages/vscode-extension/src/host-extra.js` — `recentSessions` (:968), `gitStage` (:657), `extractPending`/paths (:1151), `gsCache` (:975)
- `packages/vscode-extension/src/row-renderer.js` — `deriveStages` (:87-105), `STAGE_META` copy (:76), stage copy map (:400), CTA `Save my work` (:419), chips gstage/ghg (:296-374, :502-504)
- `packages/vscode-extension/src/extension.js` — `renderInbox` (:2591-2608), handlers `m.cmd` (:654 gitFlow · :782 projHandoff · :834 hoffCopy · :853 refreshIntegrations · :864 archiveSession)
- Testes: `data.test.js`, `deck-shell.test.js` (já cobrem unsaved/dirty — estender)

## DO

**D1 — Atribuição por sessão (o coração da wave).**
No mesmo passe do tail em `recentSessions`, recolher os `file_path` de tool_use Edit/Write/NotebookEdit da sessão → `row.touchedFiles` (paths relativos ao cwd, dedupe, cap ~200). Novo campo derivado:
`row.unsavedOwn = touchedFiles ∩ gitStage.files` (interseção com os paths do porcelain — expor os paths do `gitStage`, hoje só conta números; guardar `files: [{x,y,path}]`, reusar `parsePorcelain` de host-extra.js:698).
- `unsavedOwn.length > 0` → esta sessão TEM trabalho seu por guardar → amber + `Save my work` legítimos.
- `unsavedOwn.length === 0` mas árvore suja → NÃO é unsaved desta sessão. Badge por sessão esconde-se.
- tail de 1MB pode não cobrir sessões longas → quando o transcript excede o tail, marcar `touchedFiles.partial=true` e degradar honestamente (ver D3).

**D2 — Inbox conta repos, não sessões.**
`renderInbox`: agrupar por repo raiz (cwd resolvido). Chip passa a `⚠️ <repo> · N por commitar` (1 chip por repo sujo), tooltip lista até 5 paths. Se TODOS os ficheiros sujos forem meta (SYNC.md, `_handoff/`, `docs/`, `*.md`, package.json/lock) → tom calmo `📝 N meta por commitar`, nunca ⚠️. Código sujo real mantém ⚠️.

**D3 — Copy honesta em `deriveStages` / STAGE_META.**
- Com `unsavedOwn`: mantém amber `unsaved work` + `Save my work` (verdade).
- Sem atribuição certa (`partial` ou interseção vazia com árvore suja): copy muda para facto de repo — "o repo tem N ficheiros por commitar" — nível informativo, sem CTA por sessão (o commit é acção de repo, não da sessão). NUNCA "The AI changed your files" sem atribuição.
- `deriveStages` ganha parâmetro novo (aditivo, back-compat: assinatura antiga = comportamento antigo, byte-idêntico nos testes existentes).

**D4 — Auditoria de TODOS os botões/badges (extensão da Fase 5 do deck).**
Inventário confirmado dos `data-a` do row-renderer: `refreshIntegrations` (:256) · `archiveSession` (:257) · `gitFlow` (:300, :419) · `handoff` (:309) · `hoffCopy` (:335, :530) · `projHandoff` (:526) — **todos têm handler** em extension.js (✅ 0 órfãos no row-renderer). Falta o sweep dos restantes: inbox chips, tabs, deck-shell, mission control, menus (+New). Para cada controlo: (a) o estado que mostra é derivado de fonte real? (b) o clique dispara efeito útil? Botão sem handler ou que mente = bug → matar ou corrigir.

**D5 — Estados derivados honestos.**
`emergência`/`vigia`/`a podar`/`unsaved` — confrontar cada um com a fonte real (git/FS/actividade), nunca só journal. `sessionGit` (journal head/branch) continua legítimo para branch/sha — o journal é pista, o git é verdade quando divergem (`diverged` já existe, :2352).

## GUARD

- `classify.js` FROZEN — sha `427d8c0b…48f` intacta. Engine packages waves 28-34.5 intocados (isto é vscode-extension, fora do freeze — confirmar allowlist da wave).
- Custo: `gsCache`/`branchCache` por cwd por refresh JÁ deduplicam — manter. Expor `files` no gitStage não adiciona chamadas git. NÃO adicionar git status por sessão (é por cwd).
- Ler o FS/git REAL da máquina (extension host corre nativo — ok). A regra `mount_git_state_unreliable` aplica-se ao sandbox do Cowork, não à extensão.
- CSP-safe (webview): sem template-literals nas funções embebidas via fn.toString() (padrão existente do row-renderer).
- Staging selectivo, nunca `git add -A`. Sem novos `.md` na raiz.
- Back-compat de testes: comportamento antigo byte-idêntico quando os campos novos estão ausentes (padrão da casa — cf. gitStage.ahead fallback :1733).

## GATE (honesto)

1. Com `git status` nativo = 0 código uncommitted (só meta), o cockpit mostra **0 badges ⚠️ unsaved por sessão** — paridade git↔badge provada por teste (fixture: árvore suja só-meta + sessão sem touchedFiles na interseção).
2. `Save my work` só renderiza com `unsavedOwn.length > 0` real — teste com fixture de transcript com Edit/Write + porcelain correspondente.
3. Inbox: 1 repo sujo = 1 chip (não N sessões); só-meta → tom calmo. Teste.
4. Auditoria: tabela controlo→fonte→handler no PR; 0 botões mortos, 0 botões que mentem.
5. Preview humano: screenshot dos dois estados (salvo ✓ vs unsaved real) para validação do Paulo.
6. Suite verde (`cd packages/cli && npm test` + extension tests) · sha classify intacta.

## NEXT

Encaixa após Deck Polish, antes de escalar features. Contexto do dia: `_handoff/CTO_COMMAND_DECK_SPEC.md` + `_handoff/DECK_POLISH_MASTERPROMPT.md`.

## BACK

No fim: handoff inverso com (a) diff da tabela de auditoria D4, (b) quaisquer controlos que decidiste matar e porquê, (c) se o tail de 1MB se revelou insuficiente para touchedFiles em sessões reais (dado para decidir um índice persistente em wave futura). Commit selectivo, branch própria `wave/honest-controls`, sem merge a main sem gate humano.
