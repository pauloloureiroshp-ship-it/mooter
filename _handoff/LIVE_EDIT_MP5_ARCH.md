# Live Edit MP5.0+5.1 — Architecture Decision Record (código aterrado)

> Executado a partir de `main` (worktree `../frugal-liveedit`, branch `feat/live-edit`).
> Spec-mãe: `_handoff/LIVE_EDIT_MP5_SPEC.md` §3 + §5.2. Este doc regista as **decisões** que
> o masterprompt mandou "decidir e documentar no início", e a **reconciliação com a realidade
> do repo** (o que a spec assumia existir e não existia).

## 0. Reconciliação com a realidade (o que a spec assumia ≠ o que main tinha)

A spec foi escrita a assumir uma base que **não estava aterrada em `main`**:

| A spec assumia | Realidade em `main` (05d3601) | Consequência |
|---|---|---|
| "MP3 aterrado" (relógio tz, multi-page nav) | ❌ Só MP1 + MP2. MP3 nunca aterrou. | Não há nav multi-página para reusar. Fora de escopo aqui na mesma. |
| "reusar o `lp-error-tap.ts` (agente dev-only já injetado no `layout.tsx`)" | ❌ `lp-error-tap.ts` **não existe em nenhum ref** (`git log --all` = vazio). Era WIP nunca aterrado. | O agente in-app é **construído de raiz** (`LiveEditTap.tsx`), não "estendido". Comportamento = exatamente o que a spec §3.2 descreve. |
| iframe do App Stage | ✅ Existe (MP2, `extension.js::getLivePreviewHtml`, origin-lock por HOST_TOKEN) | É a superfície que estendo. |
| `next.config` com turbopack | ❌ Sem chave `turbopack`; `next dev` = webpack (sem `--turbopack` em 15.5) | Adiciono `turbopack.rules` + script `dev:inspect`. |

> A branch de trabalho anterior (`wave/honest-controls`) estava **4 commits atrás de main** e nem
> tinha o iframe MP2 — daí a ordem do masterprompt "worktree from main" ser **obrigatória**.

## 1. Decisão: `code-inspector-plugin` (não transform próprio)

**Escolhido: `code-inspector-plugin` (MIT), dev-only, via `turbopack.rules`.** Razão da rejeição do
"transform próprio zero-dep":

- **Turbopack usa SWC, não Babel.** Um stamper próprio precisaria de um **SWC WASM plugin**
  (`experimental.swcPlugins`) — muito custo — ou de um loader Babel via `turbopack.rules` que
  **desliga o SWC** nesses ficheiros (dev lento). Não é "zero-dep barato"; é mais frágil.
- `code-inspector-plugin` resolve a integração Turbopack, sobrevive a **React 19** (que removeu
  `_debugSource` — fiber-walking morto) e a **RSC** (a verdade está no DOM), e trata `asChild`/Slot.
- Atributo emitido: **`data-insp-path="file:line:col:tag"`** (o nome que a spec já usava). Default
  `hideDomPathAttr:false` mantém-no no DOM. ✅

**Neutralização do overlay embutido:** o plugin injeta um runtime cliente (overlay + hotkey +
servidor local de "abrir editor"). Nós **não** o queremos a conduzir a interação — o nosso tap,
origin-locked, é que manda, e roteia pelo host VS Code (não pelo servidor do plugin). Por isso:
`hotKeys: false` → o overlay do plugin fica dormente; só o `data-insp-path` é aproveitado.

**Dead-code em prod:** o bloco `turbopack` só corre em `next dev`. Além disso o plugin só é ligado
via o script **`dev:inspect`** (`next dev --turbopack`); `npm run dev` normal (webpack) fica intacto
e **sem** o atributo. Degradação honesta: sem `dev:inspect`, o tap mostra "sem source-map — arranca
com `npm run dev:inspect`" em vez de falhar em silêncio. `next build` nunca aplica a regra → o
atributo **jamais** vai para produção.

## 2. Decisão: AST via `recast` + `@babel/parser` (no host da extensão)

- **`recast`** reimprime preservando formatação (só as linhas tocadas mudam) → diff cirúrgico +
  rollback trivial. **`@babel/parser`** (plugins `jsx`+`typescript`, `tokens:true`) alimenta o recast.
  Sem `@babel/traverse`: um walk recursivo próprio acha o `JSXOpeningElement` por `loc.start.line`.
- Corre no **host** (Node, na extensão VS Code) — é lá que a spec põe "o host aplica via AST".
- Módulo isolado e **testável sem browser**: `live-edit-ast.js` (+ `live-edit-ast.test.js`,
  `node --test`). É a peça que prova o GATE "mudo uma cor → patch correto" de forma automática.
- A extensão é **unbundled** (`main: ./src/extension.js`, sem esbuild) → as deps viajam como
  node_modules no vsix. `recast`+`@babel/parser` são poucos ficheiros; aceitável para tooling dev.

## 3. Protocolo de mensagens (locked — os dois lados têm de bater certo)

Três origens: **dev-server** (iframe, `localhost:PORT`) · **webview** (`vscode-webview://`, pai do
iframe) · **host** (extensão Node).

```
[iframe tap]  --window.parent.postMessage-->  [webview]  --vsapi.postMessage-->  [host]
   source:'mooter-liveedit'                    origin-check + forward           clamp + act
```

- **tap → webview** (`postMessage(_, '*')`, marcado `source:'mooter-liveedit'`):
  - `{type:'lp-hover', rect}` — highlight é desenhado **dentro** do iframe (shadow DOM,
    `pointer-events:none`, `position:fixed`); segue o scroll do site. (postMessage de hover é
    opcional/throttled — o webview pode ignorá-lo.)
  - `{type:'lp-select', path, file, line, col, tag, rect, text}` — no click (capture, preventDefault,
    stopImmediatePropagation → o site não reage). `rect` = viewport do iframe → o webview ancora o
    painel. `text` = textContent truncado (default do campo de texto).
- **webview aceita a mensagem do iframe SÓ SE** `data.source==='mooter-liveedit'` **E**
  `new URL(ev.origin).host === new URL(curSrc).host` **E** host ∈ {localhost,127.0.0.1}. Isto é um
  **segundo caminho de entrada, estritamente limitado**: nunca pode re-apontar o iframe nem forjar
  um snapshot (esses continuam a exigir `__t===HOST_TOKEN`, que o iframe não consegue ler). O painel
  só pode: abrir ficheiro e aplicar edição — sempre clamped ao workspace no host.
- **webview → host** (`vsapi.postMessage`):
  - `{type:'lp-open', file, line, col}` — click-to-code.
  - `{type:'lp-apply', file, line, col, tag, op}` — edição determinística.
  - `{type:'lp-undo'}` — rollback da última edição.
- **host → webview** (canal HOST_TOKEN existente): `{type:'lp-applied', ok, changed, touched, error}`.
- **webview → iframe** (mode toggle): `frame.contentWindow.postMessage({source:'mooter-host',
  type:'liveedit-mode', on}, iframeOrigin)` — liga/desliga o select-mode do tap.

## 4. Segurança (defense-in-depth, além do origin-lock existente)

1. **Origin-lock do novo caminho** (webview): host de `ev.origin` == host do iframe atual + localhost.
2. **Path clamp (host, crítico p/ escrita):** `file` do `data-insp-path` é resolvido contra `wsRoot`;
   rejeita tudo o que escape (`resolved.startsWith(wsRoot+sep)`) e extensões fora de
   `.tsx/.jsx/.ts/.js`. Vale para `lp-open` **e** `lp-apply`.
3. **Rollback atómico:** o host guarda o conteúdo anterior; escrita falhada → original intacto;
   `lp-undo` restaura. HMR nativo do dev-server reflete a escrita sozinho.
4. `classify.js` **FROZEN** — só é **invocado** (`node tools/router/classify.js "<instr>"`), nunca
   modificado. Fail-soft: se não correr, o chip cai para o default honesto.

## 5. Chip de modelo (honest cost)

- Ações **determinísticas** (texto/cor/spacing/classe) → chip fixo **"🐮 local · $0 · sem LLM"**
  (verdadeiro por construção — não há chamada a modelo).
- Campo de instrução livre (ponte p/ MP5.2) → preview do tier que o `classify.js` daria à instrução,
  com **override manual** (T0 local · T2 Sonnet · T3 Opus · @fable). MP5.1 só executa o caminho $0;
  o caminho LLM é MP5.2 (fora deste brief).

## 6. Ficheiros (o que este MP toca)

**Novos:** `landing/app/_components/LiveEditTap.tsx` · `packages/vscode-extension/src/live-edit-ast.js`
· `packages/vscode-extension/src/live-edit-ast.test.js` · `packages/vscode-extension/src/live-edit-host.js`.
**Editados:** `landing/next.config.ts` (turbopack.rules dev-only) · `landing/package.json`
(`code-inspector-plugin` devDep + script `dev:inspect`) · `landing/app/layout.tsx` (injeta `<LiveEditTap/>`
dev-only) · `packages/vscode-extension/package.json` (`recast`+`@babel/parser`) · `.../extension.js`
(handlers `lp-*` + painel/overlay/chip no `getLivePreviewHtml` + toggle select-mode).

**Fora de escopo (anti-scope):** MP3 (relógio/nav), MP5.2 (LLM estrutural), MP5.3 (marquee de área).
`classify.js` não é tocado. Sem push sem OK. GATE = verificação manual do Paulo (browser vivo).
