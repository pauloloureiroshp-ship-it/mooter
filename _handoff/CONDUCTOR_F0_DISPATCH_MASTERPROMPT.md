# ⇄ COWORK→CC · Moo Dispatch F0 — fila de masterprompts → sessão CC certa (v2, pós-red-team)

---
dispatch: { worktree: frugal-dispatch, base: main, model: sonnet, mode: fresh }
---
Worktree ../frugal-dispatch from main. Arquitectura Opus, código Sonnet.
Lê primeiro: _handoff/CONDUCTOR_F0_REDTEAM.md (a spec REAL — v2 corrige o v1) +
_handoff/MOOTER_CONDUCTOR_PRODUCT_DESIGN.md (§1 contexto da ponte).

GOAL
O cockpit ganha "⇄ Dispatch": cartões nascem automaticamente dos masterprompts em
`_handoff/dispatch/*.md` (+ caixa de colar como fallback). Um clique → valida → cria a worktree →
grava o prompt → abre **terminal integrado do VS Code** na worktree com `claude` e o bootstrap
**pré-preenchido, não submetido** — o Enter é do Paulo. Fim do "qual aba? qual worktree?".

WHERE
packages/vscode-extension/ — tudo ADITIVO:
- novo `src/dispatch.js` (parser front-matter+regex, validações, sequência de launch — módulo puro)
- novo `src/dispatch.test.js`
- extension.js + webview: secção Dispatch (diff mínimo, padrão dos handlers existentes)

DO
1. **Fonte da fila**: watcher de `_handoff/dispatch/*.md` (cria o dir; um ficheiro = um cartão;
   `readBusTail`-style fail-soft). Caixa de colar = grava para lá e o watcher apanha. Retrocompat:
   botão "importar de _handoff/" lista `*MASTERPROMPT*.md` existentes.
2. **Parser** (`parseMasterprompt(text)`):
   a. front-matter `dispatch: {worktree, base, model, mode}` (novo formato canónico — preferido)
   b. fallback regex `Worktree\s+\.\.\/([A-Za-z0-9._-]+)\s+from\s+([A-Za-z0-9._\/-]+?)(?:[.\s]|$)`
      (validada contra os cabeçalhos reais do MP5 spec, incl. "(depois de MP3)")
   c. nada → card `needsInput` que PERGUNTA worktree+base. Nunca inferir.
3. **Validações pré-voo**:
   - nome saneado `[A-Za-z0-9._-]`, sem traversal; base via `git rev-parse --verify`
   - **1w=1s na fonte certa**: worktree ocupada se `~/.claude/projects/<enc(cwd)>/*.jsonl` tem
     mtime <30min (enc = cwd com `[\\/:.]`→`-`; mesma ground truth de recentSessions). Ocupada →
     BLOQUEIA com msg honesta. Livre+existente → reusa com aviso. `git worktree list --porcelain`
     (parser PCSNAP existente) para existência.
   - `where claude` no PATH; senão card degrada p/ Plano C já no pré-voo.
4. **Cartão pré-voo** (honest-copy): título · worktree (nova/reusada) · base · modelo · plano de
   launch (A/B/C e porquê) · aviso "worktree nova = npm install em packages/cli+router antes de
   testes" · frase: "nada corre até carregares Enter no terminal". Dispatch/Cancelar.
5. **Launch — escada de degradação honesta**:
   **A (default):** `git worktree add ../<name> <base>` (execFile host-side, padrão Commit&Push,
   nunca -f) → grava masterprompt COMPLETO em `<worktree>/_dispatch/MASTERPROMPT.md` → snapshot
   dos `.jsonl` existentes em `~/.claude/projects/<enc>/` → `createTerminal({cwd, name:'🐮 '+name})`
   → `sendText('claude')` → **poll ≤15s por .jsonl NOVO** nesse dir → quando aparecer,
   `sendText('Lê e executa _dispatch/MASTERPROMPT.md. GUARD: classify.js FROZEN · selective add · sem push/merge sem OK do Paulo.', false)`
   (SEM newline = pré-preenchido). Timeout → NÃO digita; statusbar honesto + oferece B.
   **B:** `openExternal('claude-cli://open?cwd=<abs>&q=<bootstrap encodeURIComponent>')`;
   pré-flight `reg query HKCU\Software\Classes\claude-cli /ve` (execFile).
   **C:** clipboard + `mooter.newSession` (fluxo playWave actual) com instrução honesta.
6. **Registo**: appenda `{ts, title, worktree, base, plan, promptFile, status:'dispatched'}` a
   `_handoff/dispatch/dispatch.jsonl`; cockpit mostra mapa cartão→worktree→sessão (liga ao
   `openSessionTab` quando a sessão aparecer via recentSessions). O Doctor colhe daqui (não
   construir lifecycle novo).
7. **Testes** (módulo puro): front-matter/regex/needsInput; sanitização; enc(cwd) Windows;
   ocupada-vs-livre (fixtures de mtime); montagem do bootstrap (constante, sem conteúdo do MP);
   escada A→B→C (seams injectáveis p/ createTerminal/openExternal/execFile). Smoke manual:
   despachar o MP3 real do LIVE_EDIT_MP5_SPEC.md §5.1.

GUARD
classify.js FROZEN (sha 427d8c0b…) — intocado; só ficheiros NOVOS + diff mínimo em extension.js/
webview; o dispatch NUNCA executa conteúdo do masterprompt (parse+grava; o bootstrap digitado é
CONSTANTE); prefill só DEPOIS de detectar o .jsonl da sessão (nunca digitar às cegas p/ shell);
zero merge/push/rm/deploy host-side; selective git add; PT-PT no copy, inglês no código;
honest-copy: o card diz sempre o plano e o que vai acontecer; NÃO usar o nome "Conductor" em copy
visível (colisão com conductor.build) — usar "Dispatch".

GATE
- Largar o MP3 real em `_handoff/dispatch/` → cartão aparece sozinho com `frugal-mp3 · main · Sonnet`
- Dispatch (Plano A) → worktree criada · `_dispatch/MASTERPROMPT.md` lá · terminal integrado
  nomeado 🐮 abre DENTRO do VS Code com bootstrap pré-preenchido · Enter meu dispara
- Worktree com sessão viva (<30min) → bloqueado com msg honesta; livre → reusa com aviso
- `claude` fora do PATH → card já mostra Plano C, nada rebenta
- Masterprompt sem worktree → card pergunta, nunca adivinha
- Testes novos verdes + suite sem regressões · sha classify.js intacta · vsix instala e cockpit
  funciona em repo sem `_handoff/dispatch/`

NEXT
F1: multi-select da fila + setup-command opcional pós-worktree (npm install) + estado landed/archived
no dispatch.jsonl. F2: `claude --resume <sid>` no mesmo terminal p/ responder-a-viva + moo decide.

BACK
Reporta: gif/screenshot do cartão→terminal pré-preenchido · diff resumido · testes · qual plano
correu na tua máquina e porquê · se o poll dos .jsonl foi fiável (timing real do arranque do CC).
