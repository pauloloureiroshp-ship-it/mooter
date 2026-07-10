# WAVE WCOCKPIT-9 — Cockpit ⇄ Cowork Mirror + Per-Session Power
### MASTER PROMPT (Claude Code · loop autónomo até verde)

> Identidade: **Mooter** — "Your LLM router. Local-first. Learns forever." Tom founder-pragmatic, PT-PT, denso, honesto.
> Este brief implementa 8 pedidos do Paulo sobre o cockpit (extensão VS Code `packages/vscode-extension`).
> Versão actual instalada: **0.16.10** (Doctor 100% verde; CLI real deployada em `~/.mooter/cli/mooter.js`).

---

## 0) GATES DE GOVERNAÇÃO (invioláveis)

- **`tools/router/classify.js` FROZEN** — sha256 CI-enforced `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`. NUNCA tocar. Verificar a sha no início e no fim de cada bloco.
- **Allowlist desta wave** (única excepção ao "engine frozen"): só estes ficheiros do cockpit podem ser modificados —
  `packages/vscode-extension/src/{row-renderer.js, extension.js, host-extra.js, mode-registry.js, cowork-waiting.js, data.test.js}` e `packages/vscode-extension/package.json` (bump). MAIS, no lado Cowork↔CC: `_handoff/loop/sdk-runner.mjs`, `_handoff/loop/signal.ps1` (escrita do mapa de sessões). Nada de `packages/router/*` nem `packages/cli/src/*` excepto **leitura**.
- **`git add` selectivo** — nunca `git add -A`. Stage exactamente os ficheiros tocados.
- **Nada de push sem OK humano.** Merge `→ main` é gate humano. (O cockpit pode PREPARAR commit/push mas o disparo final fica atrás de confirmação — ver Bloco C.)
- **Honestidade** — todo número tem rótulo e fonte; nada de project/grupo inventado; se um dado não existe, mostrar "—" ou rótulo de fallback explícito, nunca fingir.
- **Testes** — `cd packages/vscode-extension && node --test src/*.test.js` tem de ficar no baseline (1 fail conhecido = `webview-syntax.test.js` "COWORK is not defined"; tudo o resto passa). Cada bloco acrescenta testes.

## 1) ARMADILHAS CONHECIDAS (lições da sessão anterior — lê antes de começar)

- **Deploy da extensão:** `code --install-extension <vsix> --force` fica **pendente**; "Restart Extensions" (host) NÃO aplica install/uninstall — **só um reload total** do VS Code (Fechar tudo + reabrir) aplica. Método fiável: Extensions → "…" → *Install from VSIX* → reload total.
- **Comandos `mooter`:** o `mooter` na PATH é só um **wrapper de statusline** (`tools/router/mooter.cmd`→`.ps1`) que tenta autenticar (401). A CLI REAL (com `slash-commands`/`pack`) é o bundle `packages/cli/mooter.js`, que se **reconstrói com `node build.mjs`** (esbuild só corre no SO certo) e foi deployada para `~/.mooter/cli/mooter.js`. Para correr a CLI: `node "~/.mooter/cli/mooter.js" <cmd>` (host-side).
- **NUNCA correr comandos num terminal do VS Code que tenha Claude Code:** cada terminal auto-arranca o CC; comandos viram prompts → 401. **Tudo host-side** via `execFile`/`execNode` (como os checks do Doctor já fazem), nunca `runInTerminal`.
- **`MOOTER_PACKS_DIR`** override aponta a CLI aos packs do repo (`<repo>/packs`) — o `defaultPacksDir()` quebra dentro do bundle.
- **classify.js sha** confirmado intacto; mantém assim.

---

## 2) ESTADO ACTUAL RELEVANTE (onde mexer)

| Conceito | Ficheiro / símbolo |
|---|---|
| Render do cartão de sessão | `row-renderer.js` → `renderRow(r, opts)`; `renderGroupHeader(key, group)` |
| Modelos por sessão (dropdown) | `row-renderer.js` → `SESS_MODELS` (HOJE só Claude) |
| Modos por sessão (segmented) | `row-renderer.js` → `MODES_UI` = lazy/moo/crazy |
| Drawer (hover/selecção) | `.sdrawer` (CSS em `extension.js`) — mode-seg + ctrl(model+auto+integrações+✕) |
| Agrupamento por projeto | `extension.js` → `projOf(r)=coworkProject||repoFolder||project`; `mode-registry.byProject` |
| Estado por sessão (persistente) | `mode-registry.js` → `.mooter-sessions.json` (mode/model/auto/project/brainTitle/notion/obsidian/archivedAt) |
| Mapa Cowork↔CC | `cowork-waiting.js` → lê `.cowork-pending.json` (UMA sessão à espera) |
| Git stage por sessão | `host-extra.js` → `gitStage(cwd)` → `{state,dirty,staged,ahead,behind}`; `recentSessions()` |
| Handlers webview→host | `extension.js` → `onDidReceiveMessage` (setMode/setModel/setAuto/archiveSession/packInstall/...) |
| Fixes Doctor host-side | `host-extra.js` → `execMooter()` (node `~/.mooter/cli` → fallback global) |

---

## 3) OS 8 BLOCOS DE TRABALHO

### BLOCO A — Espelho Cowork (projeto + conversa) por sessão  ⭐ FUNDAÇÃO
**Problema (pontos 2 e 3 do Paulo):** o agrupamento mostra `FRUGAL`, `SYSTEM32`, `MICROSOFT VS CODE` (= basename do `cwd`/`repoFolder`) em vez do **projeto real do Cowork (ex.: "Mooter.ai")**. Causa: `coworkProject`/`coworkTitle` só são preenchidos para a ÚNICA sessão em `.cowork-pending.json` (estado "waiting"); as restantes caem para `repoFolder`. Não há **mapa persistente CC↔Cowork por sessão**.

**Solução:**
1. **Registo persistente** — estender `mode-registry.js` (`.mooter-sessions.json`) com `coworkProject`, `coworkTitle`, `coworkConversationId`, `coworkUpdatedAt` por `session_id`. Adicionar `setCowork(sid,{project,title,conversationId})` + incluir no `DEFAULT` + no `decorate()` (ler para TODAS as sessões, não só a "waiting").
2. **Lado Cowork escreve o mapa** — `_handoff/loop/sdk-runner.mjs` (ponte Cowork→CC) e/ou `signal.ps1` passam a escrever, por cada sessão CC que o Cowork associa, `{session_id, coworkProject, coworkTitle, coworkConversationId}` num ficheiro `~/.claude/tools/router/.cowork-sessions.json` (mapa `{sid: {...}}`) — distinto do `.cowork-pending.json` (que continua a ser o estado "waiting" instantâneo). `mode-registry.decorate` lê este mapa.
3. **`projOf`** passa a: `coworkProject (do mapa persistente) || coworkProject(pending) || "Unassigned"`. O `repoFolder` deixa de ser projeto — passa a **sub-rótulo honesto** dentro do grupo ("📁 frugal"), nunca o nome do grupo.
4. **System32 / standalone:** sessões CC sem mapeamento Cowork agrupam em **"Unassigned (sem Cowork)"** com o `repoFolder` como sub-rótulo. NUNCA mostrar "System32" como se fosse projeto.
5. **Honestidade:** cabeçalho de grupo distingue origem — `🗂 Mooter.ai · Cowork` vs `📁 Unassigned · repo:System32`. Número de sessões sempre com rótulo.

**Aceitação A:** com o mapa escrito, TODAS as sessões da mesma conversa/projeto Cowork agrupam sob o nome Cowork real; nenhum grupo chamado "System32"/"frugal" quando há mapeamento; fallback rotulado quando não há. +tests em `data.test.js` (decorate lê mapa; projOf prioriza Cowork; fallback rotulado).

### BLOCO B — Cartão de live session ainda mais compacto (hover)
**Pedido 1:** ao passar o rato, o cartão pode ficar menor — juntar a **1ª e 2ª linha numa só** (nome + estado/id na mesma linha).
**Solução:** em `renderRow`, modo compacto (default e hover): `🐮 <nome truncado> · <badge estado> · <id>` numa linha única (`.stop` + `.ssub` fundidos numa `.sline`). O drawer (controlos) continua só em `.on`/`:focus-within`. Reduzir altura do cartão ~30%. Manter ellipsis no nome. `aria-label` mantém nome completo.
**Aceitação B:** cartão default = 1 linha de conteúdo + chips git/branch deduplicados (já existentes); drawer só na selecção. Screenshot antes/depois. Testes de presença de `.sline` e que o nome+estado coabitam.

### BLOCO C — Estágio por sessão + botão único Commit/Push (com harmonia)  ⚠️ ALTO RISCO
**Pedidos 4 e 5:** mostrar o **estágio** de cada sessão; se há itens por commit/push, um **botão** que valida e faz commit→push (e merge como acção separada e guardada), **sempre olhando às outras sessões** (mesma repo+branch = mesmo trabalho), em tempo real ou no refresh por sessão. "waiting to commit" → botão → faz.
**Solução (host-side, seguro, reversível, gated):**
1. **Chip de estágio** (estende o `gitStage` actual): `✓ clean` · `● N uncommitted` ("⚠ waiting to commit") · `◐ N staged` · `↑N to push` · `⇡ pushed`. Verificar **correctude no backend** (pedido 4): `gitStage(cwd)` lê `git status --porcelain` + `rev-list @{u}...HEAD`; testar com repos limpos/sujos/ahead.
2. **Botão "Commit & Push"** no drawer da sessão (só aparece quando há trabalho). Fluxo host-side via `execFile('git', ...)` no `cwd` da sessão:
   - **Preview obrigatório** (nunca cego): mostra ficheiros a commitar (`git status --porcelain`) + a mensagem proposta. **Stage selectivo** dos ficheiros dessa sessão (nunca `git add -A`).
   - **Harmonia/segurança:** se ≥2 sessões partilham `repo+branch`, AVISAR ("outra sessão está no mesmo branch") e exigir confirmação. Verificar `classify.js` sha intacta ANTES de commitar (abortar se mudou). Nunca `--force`.
   - **Commit** com mensagem (editável; default convencional `wip(<branch>): <resumo>`). **Push** só após **confirmação explícita do Paulo** (gate). 
   - **Merge** = acção SEPARADA, sempre gate humano + FF-only preferido; nunca automática.
3. **Tempo real / refresh:** o estágio actualiza no refresh por-sessão (botão ↺ já existe) e no refresh global.
4. **Honestidade:** cada acção mostra o comando git exacto que vai correr (preview) e o resultado real (não "sucesso" presumido).
**Aceitação C:** preview correcto; stage selectivo; aviso de harmonia; push só com confirmação; merge gated; sha guard; +tests de `gitStage` states e da lógica de harmonia (sem correr git destrutivo nos testes). **NUNCA** push automático.

### BLOCO D — Modelos LLM locais por sessão (não só Claude)
**Pedido 6:** o dropdown de modelo por sessão só tem Claude; falta os **LLMs locais (Ollama)**.
**Solução:** `SESS_MODELS` passa a ser construído dinamicamente = tiers Claude (Auto/Opus/Sonnet/Haiku) **+** os modelos Ollama instalados (`snapshot.ollama`, com ícone 🦙 e hint de tamanho/velocidade já existente `localTag`). `renderRow` recebe a lista via `opts.localModels`. O registo por sessão (`mode-registry`) já aceita qualquer string de modelo. Marcar pesados (≥8GB) com "⚠ lento (cold-load)".
**Aceitação D:** dropdown lista Claude + locais reais (do snapshot); seleccionar um local persiste e fica `selected`; +test.

### BLOCO E — Picker de slash-commands (skills + Moo Packs) por sessão
**Pedido 7:** por sessão, escolher **slash commands** de todos os skills/Moo Packs, com **parêntesis a explicar** o que cada um faz naquela sessão.
**Solução:** novo control no drawer — um `<select>`/menu que lista os slash commands disponíveis (do `mooter slash-commands` + dos packs instalados). Fonte host-side: `execMooter(['slash-commands','list','--json'])` e os `commands` de cada pack instalado (`~/.mooter/installed_packs.json` → `packs/<name>/pack.yaml`). Cada item: `"/comando — (descrição curta)"`. Acção ao escolher: copia o comando para o clipboard E sinaliza a sessão (via `.cowork-pending`/registry "nextSlash") para uso no próximo prompt dessa sessão; mostrar toast honesto ("/x copiado — cola na sessão" OU, se a ponte CC suportar, injecta).
**Aceitação E:** lista real de comandos+descrições; selecção dá feedback claro; sem inventar comandos (só os realmente instalados); +test do parser.

### BLOCO F — Toggle **LoopMoo** por sessão (identidade de marca)
**Pedido 8:** toggle para a sessão usar **modo loop** — chamar **LoopMoo** (🔁), a par de CrazyMoo/LazyMoo.
**Solução:** adicionar estado por sessão `loop:bool` no `mode-registry`. UI: um toggle `🔁 LoopMoo` no drawer (ao lado de `auto`), OU 4º botão no segmented — **decisão recomendada:** toggle separado (o segmented lazy/moo/crazy é intensidade de routing; loop é modo de interacção). Quando ON: a sessão entra no **autopilot loop** (infra `_handoff/loop`): o handler `setLoop(sid,on)` escreve o flag e (se a ponte estiver activa) inscreve a sessão no loop-runner. Cow do cartão ganha animação própria `🔁`. Honestidade: se o loop-runner não estiver a correr, o toggle mostra "LoopMoo armado (loop não activo)".
**Aceitação F:** toggle persiste; estado visível; integra com `_handoff/loop` quando disponível; degradação honesta quando não; +test do estado.

---

## 4) PROTOCOLO BUILD / INSTALL / VERIFY (por bloco)

1. Editar só ficheiros da allowlist. `node --check` em cada `.js` tocado.
2. `cd packages/vscode-extension && node --test src/*.test.js` → baseline (1 fail conhecido).
3. `git status` selectivo; **não** commitar sem rever; **não** push sem OK.
4. Bump `package.json` (0.16.10 → 0.16.11 → …). `npx @vscode/vsce package --no-dependencies --allow-missing-repository -o mooter-cockpit-<v>.vsix`.
5. Instalar: **Install from VSIX** (UI) + **reload total** do VS Code. (Não confiar no "Restart Extensions".)
6. Verificação **visual** no cockpit (screenshot) — é o canal fiável. Confirmar cada aceitação no ecrã.
7. `classify.js` sha re-verificada no fim.
8. Se tocar a CLI/packs: rebuild bundle (`node build.mjs` em `packages/cli`) + redeploy `~/.mooter/cli/mooter.js`; correr comandos **host-side** com `MOOTER_PACKS_DIR=<repo>/packs`.

## 5) DEFINIÇÃO DE PRONTO (DoD)
- [ ] A: grupos = projetos Cowork reais (espelho); zero "System32/frugal" como projeto; fallback rotulado; mapa persistente escrito pelo lado Cowork.
- [ ] B: cartão compacto (nome+estado em 1 linha); drawer só na selecção.
- [ ] C: estágio correcto por sessão; botão Commit (preview+selectivo) → Push (confirmado) → Merge (gated); harmonia entre sessões; sha guard; nunca destrutivo/auto.
- [ ] D: dropdown com Claude + locais Ollama reais.
- [ ] E: picker de slash-commands de skills/packs com descrições reais.
- [ ] F: toggle LoopMoo por sessão, persistente, integrado com o loop, degradação honesta.
- [ ] Testes verdes (baseline + novos); `classify.js` sha intacta; nada commitado/pushed sem OK.
- [ ] Cada bloco verificado por **screenshot** no cockpit.

## 6) ORDEM SUGERIDA
A (fundação do espelho) → B (compactação) → D (locais, rápido) → F (LoopMoo, rápido) → E (slash picker) → C (git one-button, último por ser o de maior risco). Loop por bloco: implementar → testar → build → install → screenshot → próximo. Parar e perguntar ao Paulo em qualquer passo irreversível (push/merge/apagar).
