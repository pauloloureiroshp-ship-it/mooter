# Mooter Autopilot Loop — feature spec (a feature de que a Anthropic teria orgulho)

**Composto:** 2026-06-22, Cowork · **Onde vive:** plugin `packages/vscode-extension` (cockpit) + bus `_handoff/loop/` + headless CC
**One-liner:** *autonomia calibrada com humano no comando.* O cockpit corre o Claude Code em loop (Generator→Evaluator) sozinho — mas **pára e escala-te em qualquer acção irreversível**, mostra **tudo** num ledger transparente, e nunca faz merge/push/deploy por iniciativa própria.

---

## Porque é que a Anthropic teria orgulho disto (não é "auto-run reckless")
A maioria dos loops autónomos optimiza para "anda sozinho o máximo possível". Esta feature optimiza para os princípios que a Anthropic publica e defende:

| Princípio Anthropic | Como a feature o materializa |
|---|---|
| **Autonomia calibrada, não cega** | O loop só prossegue sozinho quando a ronda é reversível e de baixo risco. Em risco/ambiguidade, **escala** (reusa o ACT/ESCALATE do Council). |
| **Humano no comando de acções irreversíveis** | merge/push/deploy/secrets/apagar dados → **nunca** autónomo; vira um cartão "Precisa de ti" no cockpit com Aprovar/Parar. |
| **Transparência radical** | Ledger por ronda (o que mudou, ok/falha, custo), INBOX/OUTBOX visíveis, e o **motivo exacto** de cada pausa. Nada escondido. |
| **Custo honesto / local-first** | Avaliador pode correr em Ollama ($0); cloud só quando "earns its cost". O cockpit mostra o gasto. |
| **Invariantes prováveis** | `classify.js` FROZEN re-verificado por sha a cada conclusão; nunca toca em engine packages frozen. |
| **Kill switch sempre** | Botão STOP (sentinela `_handoff/loop/STOP`) + `maxRounds` + timeout por ronda. |

É autonomia que um laboratório de segurança mostraria como exemplo: **faz o trabalho chato sozinho, e a única coisa que te pede é a decisão que só um humano deve tomar.**

---

## Arquitectura (3 peças, todas já existem em protótipo)
```
┌─ Cockpit (plugin VS Code) ─────────────────┐   clique único, sem digitar
│  Tab "🛸 Autopilot": Start / Stop / Aprovar │──runInTerminal──► node loop-runner.mjs
│  Ledger transparente + cartão "Precisa de ti"│                        │ (headless CC)
└───────────────▲─────────────────────────────┘                        ▼
                │ lê (fs puro, cada refresh)                  _handoff/loop/  (file-bus)
                │                                             STATE·INBOX·OUTBOX·ledger·ASK_HUMAN·STOP
        ┌───────┴──────────┐  escreve INBOX / decide              ▲
        │ Cowork evaluator │◄─────────────────────────────────────┘
        │ (scheduled task) │  gate humano: status=awaiting_human + ASK_HUMAN.md
        └──────────────────┘
```
- **Generator** = Claude Code headless (`claude -p --output-format stream-json --resume`), pilotado por `_handoff/loop/loop-runner.mjs`.
- **Evaluator** = Cowork (scheduled task `cowork-loop-evaluator`): avalia cada ronda vs `CRITERIA.md`, escreve a próxima instrução, **ou escala** acções irreversíveis para `awaiting_human`.
- **Cockpit** = o plugin: arranca (1 clique), mostra o ledger, e dá os botões Aprovar/Parar do gate humano.

Estados: `cc_running → awaiting_eval → (cc_running | awaiting_human | done | stopped)`. `awaiting_human` só sai quando o humano carrega Aprovar (escreve `HUMAN_OK`) ou Parar (`STOP`).

---

## Ficheiros entregues (prontos a integrar)
| Ficheiro | O quê |
|---|---|
| `_handoff/loop/loop-runner.mjs` | runner headless do CC (stream-json, --resume, ledger, timeout, STOP, maxRounds) |
| `_handoff/loop/{STATE.json,INBOX.md,CRITERIA.md,README.md}` | o bus + critérios da 1ª wave (eval de qualidade do Council) |
| `_handoff/autopilot-loop/cockpit-loop.js` | módulo drop-in do cockpit: `readLoopState`, `startLoop`, `stopLoop`, `approveHuman`, `renderLoopTab` |
| scheduled task `cowork-loop-evaluator` | o avaliador (cada 10 min) com gate humano |

---

## Integração no plugin (mecânica, ~30 min para o CC)
No `packages/vscode-extension/src/extension.js` (segue os padrões reais que já existem lá):
1. `const loop = require('./cockpit-loop');` (copiar `cockpit-loop.js` para `src/`).
2. `activate()`: registar `mooter.startAutopilotWave` → `loop.startLoop(runInTerminal, repoRoot())`; adicionar o comando a `package.json` `contributes.commands`.
3. `DataService.refresh()`: juntar ao snapshot `loop: loop.readLoopState(repoRoot())` (fs puro, sem spawn — respeita o overlap-guard).
4. `getHtml()` tabs: `{ id:'loop', label:'🛸 Autopilot', view: loop.renderLoopTab(s.loop) }`.
5. `onDidReceiveMessage`: casos `loopStart / loopStop / loopApprove / loopReject` (snippet no topo de `cockpit-loop.js`).
6. `repoRoot()` = `vscode.workspace.workspaceFolders?.[0]?.uri.fsPath`.

Tudo **aditivo** — zero alteração a `classify.js` ou engine packages frozen.

---

## Demo (a 1ª wave que o loop corre sozinho)
A wave já carregada no bus é o **eval de qualidade do Council** (`_handoff/loop/CRITERIA.md`): o loop implementa+corre o eval, e quando chegar a "abrir PR" (acção irreversível) **escala-te** em vez de o fazer. Provas a feature E avanças o Council de uma vez.

## Wave brief (para landar no plugin)
- **A:** copiar `cockpit-loop.js` → `src/`, wiring dos 6 pontos, smoke em DRY_RUN. Tab aparece, Start dispara o runner, ledger atualiza.
- **B:** gate humano e2e — forçar um BLOCKER irreversível, confirmar cartão "Precisa de ti" + Aprovar retoma + Parar termina.
- **C:** polish — chip na statusline (`🛸 loop round N`), custo por wave, persistência cross-restart.
- Invariantes: `classify.js` sha intacta; aditivo; nunca merge para `main`; `mooter.newSession` reutilizado.

*Nota honesta: o código está escrito e é coerente com a extensão real, mas não o consigo compilar/instalar daqui (tier "click" do VS Code + sem runtime da extensão no meu sandbox). O landing roda na tua máquina — via este loop, aliás.*

---

## Day-0 reality check & adaptations (wave-autopilot-loop, 2026-06-22)

Confirmei a estrutura real de `packages/vscode-extension/src/extension.js` (v0.16.1) e
`package.json` antes de integrar. **3 divergências** face ao §Integração acima — todas
ADITIVAS, nenhuma toca `classify.js` (sha `427d8c0b…364bc48f` provada intacta) nem engine frozen:

- **D1 — não há `getHtml() tabs[]` server-side.** `getHtml()` devolve um esqueleto HTML
  **estático**: as tabs são `<div class="tab" data-v="…">` hard-coded (linha ~416) e cada
  view (`<div class="view" id="view-…">`) é renderizada **client-side** a partir de um
  snapshot enviado por `postMessage` (`{type:'snapshot', s: project(s)}`). Não existe um
  array `tabs[]` para onde injetar `{ id:'loop', view: renderLoopTab(s.loop) }`.
  **Adaptação:** acrescentei uma 6ª tab estática (`data-v="loop"` + `#v-loop`) ao esqueleto,
  e `renderLoopTab(s.loop)` corre **host-side** em `project(s)` → vai no snapshot como
  `s.loopHtml` → o webview faz `#v-loop.innerHTML = s.loopHtml`. É exatamente o padrão já
  usado por `statuslineHtml` (host renderiza HTML, webview injeta via innerHTML).

- **D2 — CSP bloqueia `onclick` inline.** O webview corre com
  `script-src 'nonce-…'` (sem `'unsafe-inline'`), por isso `onclick="post({cmd:'loopStart'})"`
  **não dispara** e `post(...)` nem existe (a ponte real é `send(cmd,arg)` → `vsapi.postMessage`).
  **Adaptação:** no `cockpit-loop.js` copiado para `src/`, os botões emitem
  `data-loop="loopStart|loopStop|loopApprove|loopReject"` (CSP-safe) em vez de `onclick`;
  o webview liga-os com um listener delegado `wireLoop(root)` → `send(b.dataset.loop)`,
  alinhado com o `wireButtons`/`data-a` existente. O `LOOP_CSS` foi **escopado sob `.loopwrap`**
  para não vazar (`.pill`, `.muted`, `.btn`…) para as outras tabs do cockpit.

- **D3 — assinatura `startLoop(runInTerminal, repoRoot)`.** O snippet #2 mostrava
  `startLoop(runInTerminal)` (sem `repoRoot`); uso a forma de 2 args consistentemente, com
  `repoRoot()` = `vscode.workspace.workspaceFolders?.[0]?.uri.fsPath`.

**Os 6 pontos de wiring, mapeados ao código real:**
1. `const loop = require('./cockpit-loop')` — junto aos outros `require` (topo).
2. comando `mooter.startAutopilotWave` em `activate()` + `contributes.commands` (package.json).
3. `DataService.refresh()` → snapshot `loop: loop.readLoopState(repoRoot())` (fs puro, **sem**
   `doDeep` gate → atualiza a cada poll; nunca faz spawn, respeita o overlap-guard).
4. (ver D1) tab estática + `loopHtml: loop.renderLoopTab(s.loop)` em `project(s)`.
5. `onDidReceiveMessage`: casos `loopStart/loopStop/loopApprove/loopReject`.
6. `repoRoot()` helper via `workspaceFolders`.

**Teste:** `src/cockpit-loop.test.js` (node:test, corre em `npm test` → `node --test src/*.test.js`)
cobre `readLoopState` (estados idle/cc_running/awaiting_human/done/stopped via tmpdir) e
`renderLoopTab` (pílula de estado, cartão "precisa de ti", botões `data-loop`, escaping).

**Smoke manual do bus (sem gastar tokens):** na raiz, `DRY_RUN=1 node _handoff/loop/loop-runner.mjs`
→ round 1 simula e vai a `awaiting_eval`; `ledger.jsonl` + `OUTBOX.md` aparecem em `_handoff/loop/`;
`Ctrl+C` para sair. Artefactos gerados (`ledger.jsonl`, `OUTBOX.md`, `STOP`, `HUMAN_OK`,
`ASK_HUMAN.md`, `transcript/`) ficam gitignored (`_handoff/loop/.gitignore`).
