# ⇄ COWORK → CC · MP4 — Diagnóstico Honesto in-panel (o maior salto de confiança)

> **Porquê:** o estudo de paridade (`_handoff/LIVE_PREVIEW_FEATURE_STUDY.md`) mostra que a queixa nº1 do
> mercado sobre preview é **confiança** — *blank screen sem explicação*, *não vejo os erros no painel*, *o
> agente adivinha o erro e queima créditos*. O MP2 já dá o **preview fiel** (dev server real). O MP4 fecha o
> ciclo: **quando o site parte, o painel diz-te o quê e onde — sem abrires a DevTools — e alimenta a sessão CC.**
> **Base:** MP2 vive em `feat/lp-stage` (iframe persistente + CSP + detetor de porta, tudo provado 2026-07-04).

## 🎯 GOAL
Um **error/console strip** no painel Mooter · Live Preview que **auto-captura** runtime + build errors do preview
real, mostra **o quê + onde (`file:line`)**, e oferece **"abrir ficheiro"** e **"enviar à sessão CC"** — tudo
local, $0, honesto (nunca esconde um erro nem finge que curou). Mais: **reload que preserva route + scroll**.

## 📍 ONDE
Worktree nova `../frugal-lp-diag`, branch `feat/lp-preview-diagnostics` **from `feat/lp-stage`** (a base do MP2;
se já mergeaste o MP2 para `main`, parte de `main`). **Sonnet.** O dev server do landing corre em `:7819`.

## 🧠 O PROBLEMA TÉCNICO (lê antes de codar)
O iframe é **cross-origin** (`vscode-webview://` ↔ `http://localhost:7819`) → o host **não pode ler** o
`contentDocument` nem a consola do iframe (same-origin policy). A solução local-first é um **tap dev-only no
landing** que captura os erros lá dentro e faz **`window.parent.postMessage`** ao host (o MP2 já usa este canal
para o `lp-snapshot`). **Não tentes** aceder ao conteúdo do iframe pelo host.

## ▶ DO

### 1. Preview Error Tap (no `landing/`, **dev-only**, $0, sem LLM)
Um módulo que **só ativa** quando `process.env.NODE_ENV === 'development'` **E** embedded (`window.parent !== window`).
Usa `landing/instrumentation-client.ts` (Next 15) ou um `<Script>` condicional no layout dev. Captura e faz relay:
- `window.addEventListener('error', …)` → **runtime** (message, stack, filename, lineno, colno).
- `window.addEventListener('unhandledrejection', …)` → promise rejections.
- wrap de `console.error` → erros logados (sem partir o console original).
- **build/compile errors do Next**: observa o overlay de erro do Next (MutationObserver no portal `nextjs-portal`) **ou** escuta as mensagens de erro do HMR websocket. Marca `kind: 'build'`.
- Emite `window.parent.postMessage({ type:'lp-error', kind:'runtime|build|console', message, stack, file, line, col, ts }, '*')`.
- **State-preserving:** periodicamente (throttled) emite `{ type:'lp-state', path: location.pathname, scrollY }`. Ao receber `{ type:'lp-restore', path, scrollY }` do host, faz `history.replaceState`/scroll para restaurar.
- **Dev-only de verdade:** garante que **nada** disto vai para o bundle de produção (tree-shake por `NODE_ENV`).

### 2. Error Strip no host (`packages/vscode-extension/src/` — novo `lp-diagnostics.js` + costura em `extension.js`)
- No handler de `message` do webview, **valida `event.origin`** (só aceita `http://localhost:<porta detetada>` — reusa a porta do detetor do MP2; rejeita tudo o resto). **Segurança primeiro.**
- Renderiza uma **faixa** entre a toolbar e o iframe (concat-only, CSP-safe, sem innerHTML de dados não-escapados):
  - **0 erros** → strip escondido (ou um `✓` discreto). Nunca "tudo bem" se não sabes → honest-copy.
  - **runtime** → faixa vermelha: `⛔ {message}` + `{file}:{line}` + botões.
  - **build** → faixa âmbar: `⚠ build: {message}` + `{file}:{line}` + botões.
  - Agrupa/conta duplicados (`×N`); mostra o mais recente no topo; "ver todos" expande.
- **Botões** (cada um dispara um `command` real — nada de botão morto, régua honest-controls):
  - **Abrir ficheiro** → se há `file:line`, `vscode.window.showTextDocument` + revela a linha (antecipa o fosso B do MP5). Se não há localização → botão desativado com tooltip honesto "sem localização — abre a consola".
  - **Enviar à sessão CC** → MVP: formata `{message}\n{stack}\n{file}:{line}` e **copia para o clipboard** + toast "erro copiado — cola no CC". (V2: injetar direto na sessão CC ativa via o mecanismo do cockpit, se existir seam.)
  - **Dispensar** → limpa o strip (até novo erro).
- **State-preserving reload:** o host guarda o último `lp-state`; quando o iframe **tiver** de recarregar (re-detect real de porta, ou o utilizador clica refresh), reenvia `lp-restore` após o load. **E confirma o invariante do MP2**: re-detect/polls que **não** mudam a URL **não** recarregam o iframe.

### 3. Testes (à la `lp-stage.test.js`, mantém a suite verde)
- Unit: parser de `lp-error` (runtime/build/console → shape normalizado), o render do strip (0/runtime/build/×N), a **validação de origin** (rejeita origins falsos), o formatador "enviar à CC".
- `webview-syntax.test.js`-style: o strip é parseável e CSP-safe.
- Gate humano (E2E): ver GATE.

## 🔒 GUARD
`classify.js` **FROZEN** (sha `427d8c0b…`) · toca **só** `landing/` (tap dev-only) + `packages/vscode-extension/src/`
(`extension.js` + novo `lp-diagnostics.js` + testes) · **valida `event.origin`** em todo o `postMessage` · tap
**não vai para produção** (NODE_ENV) · **$0** (zero LLM no tap/strip) · **sem botões mortos nem que mentem**
(honest-controls) · selective `git add` · **sem push/merge sem o OK do Paulo** · PT-PT / inglês no código.

## ✅ GATE (prova, não promessa)
1. Meto um `throw new Error('boom @ hero')` no `landing/app/page.tsx` → o **strip vermelho aparece** com a mensagem e `page.tsx:linha`, **sem eu abrir a DevTools**.
2. Clico **Abrir ficheiro** → o VS Code abre `page.tsx` na linha certa.
3. Clico **Enviar à sessão CC** → o erro fica no clipboard, pronto a colar.
4. Um erro de **build** (erro de sintaxe) → faixa **âmbar** distinta da runtime.
5. Corrijo o erro → o strip **limpa sozinho**; o preview volta **sem perder a route/scroll**.
6. Sem erros → strip honesto (escondido/`✓`), nunca fabricado.
7. `classify.js` sha intacta · suite vscode-extension verde · origin validado (teste prova rejeição de origin falso).
Cola no fim: `git --no-pager diff --stat <base>..HEAD` (só adições) + resultado dos testes + a sha.

## ⏭ NEXT
MP5 (click-to-code full via `code-inspector-plugin` — o "Abrir ficheiro" do MP4 é o primeiro tijolo) · MP7 (o Moo
Guardião consome este error-strip como sinal para o self-heal $0). Ver `_handoff/LIVE_PREVIEW_FEATURE_STUDY.md`.

## 📋 BACK
Branch (worktree git-write) · o diff-stat (só adições) · testes verdes · sha intacta · **nada de merge/push — o
Paulo autoriza o irreversível.** Reporta o que **mediste** (não o que esperavas); `n/d` honesto onde não deu.
