# ⇄ COWORK → CC · SUPER MASTERPROMPT — Mooter Live Preview 🎬 (build-cinema, local-first, powered by CC)

> Trazer à vida o **Live Preview / App Stage** do plugin: o vibe coder vê a app a construir-se ao vivo na lateral
> direita (estilo Lovable) **mas superior** — porque por baixo é Claude Code real e o Mooter **prova o custo ao
> cêntimo na 4090**. Criação + Prova, em tempo real. Backlog: **BL-64** (Notion) · roadmap **W16** · Frente Cockpit.
> Faseado (MP0-MP4), worktree por fase, **gate humano no merge**, read-only sobre o runtime, `classify.js` FROZEN.

## 🎯 GOAL
Abrir o plugin, correr uma sessão frontend, e ver o site a montar-se ao vivo com o código a fazer stream ao lado, o
custo provado por baixo, e **click-to-edit** (clicar num elemento salta para o código). Primeiro caso de uso real:
**melhorar o site `mooter.ai`** (dogfooding — o Mooter a construir o Mooter).

## 🧠 O insight (a nossa vantagem injusta)
Lovable/Bolt correm sobre **WebContainers** (StackBlitz): um SO em WebAssembly que emula Node.js no browser —
**porque não têm a máquina do user**. O Mooter vive no **VS Code, na máquina local**: o dev server (Vite/Next) **já
corre**. Logo **NÃO usamos WebContainers** (licença comercial + emulação lenta). Apontamos um `<iframe>` ao
`localhost` **real**: mais rápido (nativo), $0, sem licença, e é o ambiente verdadeiro. A tese do produto (local-first
> cloud) aplicada ao preview.

## 📦 Repos open-source a REUSAR (não reinventar — todos MIT)
- **`code-inspector-plugin`** (npm, MIT) — **o motor do click-to-edit**. Universal: Vite/Webpack/Rspack/Next/Nuxt +
  React/Vue/Svelte/Solid/Astro. Injeta `data-source` (file:line) em dev e o click abre o VS Code na linha. **Usar como base.**
- `zthxxx/react-dev-inspector` · `hellof2e/vite-plugin-dev-inspector` (web-components, multi-framework) — alternativas/referência.
- `infi-pc/locatorjs` (MIT) — referência de UX do overlay de inspeção (hover outline + label do componente).
- `microsoft/vscode-livepreview` (MIT) — referência de hospedar server local + inspecionar dentro do webview.
- `slopus/happy` #802 — referência de que a comunidade já quer isto para CC (chegamos primeiro, com qualidade).
> Regra: reusar a INJEÇÃO de `file:line` + o overlay dos inspectors; a nossa camada é o file-bus + Build Receipt + integração cockpit.

## 🏗️ Arquitetura — 4 camadas (read-only, aditiva)
1. **Estrada dos EVENTOS (espelha o código)** — hooks do CC (`PreToolUse/PostToolUse/FileChanged/Write/Edit/UserPromptSubmit/TaskCreated/SubagentStart/Stop`) → **file-bus** `_handoff/live-preview/events.jsonl` (append-only, fail-soft) → `live-preview-view.js` → **Director's Cut** (racional · árvore de ficheiros · diff a stream).
2. **Estrada da APP (espelha o site)** — ficheiros escritos → **dev server local** (Vite/Next, HMR nativo) → `<iframe src=localhost:PORT>` no webview → **App Stage** (a app ao vivo). Detector de porta lê o stdout do dev server / `vite.config`.
3. **Ponte de volta (click-to-edit)** — `code-inspector-plugin` garante `file:line` por elemento → hover=outline, click=abre o VS Code na linha (ou postMessage→webview→`showTextDocument`). Popover advisory do cost-router ("uau, é grátis").
4. **Brain overlay** — `decisions.log` + savings + GPU → 🧾 tier · $ · % local · advisory (o cockpit já tem).

## 🔌 Mapa de integração — as pontas REAIS (confirmado no repo, 2026-07-04)
| Peça do Live Preview | Ponta real no Mooter | Estado |
|---|---|---|
| 🎞️ Director's Cut | `tools/router/live-preview-tap.js` → `hook-collector.js` → `_handoff/live-preview/events.jsonl` | ✅ existe · só **ARMAR** |
| 🌐 App Stage | iframe → dev server do `landing/` (Next 15 + React 19) em **`localhost:7819`** (`next dev -p 7819`) | alvo real = **mooter.ai** |
| 👆 Click-to-edit + Toolbar | `code-inspector-plugin` (MIT) no Next → `file:line` → `showTextDocument` + 4 modos (MP5) | reuso MIT |
| 🧠 Brain (custo/GPU) | `.mooter/cache/gpu-snapshot.json` + `decisions.log` + `savings-tracker.js` | ✅ existe |
| 💳 Subscription/quota | `detect-subscriptions.js` + `quota-tracker.js` + `subscriptions.js` | ✅ existe |
| 🖥️ Sessões/estado | `host-extra.js` + `mode-registry.js` + `session-affinity.js` | ✅ existe |
| 🧾 Build Receipt (viral) | cartão → `hub/` (Cloudflare Worker + D1, rotas `/v1/*`) · Publish → Vercel | MP4 |

**Dogfood real (primeiro App Stage):** o próprio `landing/` (mooter.ai). Arranca `cd landing && npm run dev` (→ `localhost:7819`) e o iframe mostra o site a melhorar-se ao vivo. **~70% da maquinaria já existe — o Live Preview LIGA pontas, não constrói do zero.**

## ▶ DO — 5 fases (worktree por fase, gate entre fases)
**MP0 · Armar o file-bus (JÁ EXISTE — não reconstruir)** (`../frugal-lp-bus`, `feat/lp-file-bus`): `tools/router/live-preview-tap.js` + `packages/vscode-extension/src/hook-collector.js` (`mapEvent`/`eventsPath`/`skeleton`) **já estão escritos** — aditivos, read-only, fail-soft, escrevem `_handoff/live-preview/events.jsonl`. A tarefa é **ARMAR**: wire o tap nos hooks (PostToolUse/UserPromptSubmit/Stop/SubagentStop/Task*) via `sync-hooks.js` (WIRED_HOOKS) + settings.json, em lockstep. **Gate:** uma sessão real escreve eventos no bus · `classify.js` sha intacta · accumulator turn-end intacto (`node sync-hooks.js --check` = OK).
**MP1 · Painel + Director's Cut + Brain** (`feat/lp-panel`): comando `mooter.openLivePreview` + ícone na view; `src/live-preview-view.js` (concat-only, `fn.toString()` como `row-renderer`, fail-soft) → lê file-bus + `decisions.log` + snapshot. **Gate:** painel abre · Director's Cut faz stream do file-bus real · Brain mostra custo real/`n/d`.
**MP2 · App Stage** (`feat/lp-stage`): dev-server detector + `<iframe>` com `retainContextWhenHidden`; CSP `frame-src http://localhost:*`; HMR nativo. Degrada gracioso (não-web → só Director's Cut). **Gate:** um dev server Vite real aparece no iframe e faz hot-reload ao editar.
**MP3 · Click-to-Edit** (`feat/lp-inspect`): integrar `code-inspector-plugin` no dev server; inspect mode (hover outline), click→salta para o código, highlight de `FileChanged`; popover de custo advisory. **Gate:** clicar num elemento do preview abre o ficheiro na linha certa.
**MP4 · Build Receipt** (`feat/lp-receipt`): cartão partilhável (tier · $ · % local · GPU · 4090) + export PNG/GIF. **Gate de qualidade visual (obrigatório):** *um amigo não-dev fica de boca aberta e confortável?*
**MP5 · Visual Edit Toolbar** (`feat/lp-toolbar`, inspirado no double-check aos concorrentes 2026): barra de modos sobre o App Stage — 🎯 **Select** (aponta+descreve→CC, reusa o inspector do MP3) · ✍️ **Edit text inline** (clica no texto, edita in-place, sem prompt) · ✏️ **Draw/annotate** (sketch sobre o preview → imagem → **o CC é multimodal, vê o desenho e age**) · 💬 **Comment** · **device frames** (📱/💻/🖥️ = iframe width) · **console honesto** (captura **build + runtime errors + unhandled rejections + network failures (API 500/CORS)** — a dor real é o RUNTIME, a app crasha ao usar, não só o build) · **navegação multi-página** (address bar p/ percorrer as rotas) · **a11y do iframe** (não partir tab-stops se o iframe não carrega · ARIA no chrome · screen-reader-safe) · **undo** por edit · **Publish → Vercel**. **Gate:** os 4 modos funcionam · console mostra build+runtime reais · o CC recebe o sketch como imagem · $ advisory por edit.
**MP6 · Self-heal $0 (NEXT, opt-in — o que o Bolt faz mas grátis)**: quando o console capta um erro runtime, um **moo local ($0)** propõe o fix (advisory); o user aprova/aplica. Reduz bug loops **sem queimar créditos** (a resposta directa à dor nº2 do Lovable). **Gate:** erro real → fix proposto $0 → aprovação humana · nunca auto-aplica sem OK.

## 🥊 Double-check concorrentes 2026 — o que copiar, onde GANHAMOS
| Feature (quem) | Mooter faz melhor |
|---|---|
| Preview Toolbar 4 modos (Lovable) | mesmos modos, mas CC executa (melhor modelo) + $ advisory por edit |
| Draw/annotate (Lovable) | **CC multimodal vê o sketch** — os pares usam modelos piores |
| Console/network (Replit) | **honest console**: mostra o erro REAL (eles têm "preview que mente") |
| Device frames · multiplayer (Replit) | device frames sim; multiplayer = NEXT (não MVP) |
| Deploy no editor (Windsurf) | **Publish → Vercel** (stack do Paulo), sem cloud lock-in |
| Layer/tree view (v0) | árvore de componentes = opcional (F-later) |
| Build Receipt de custo | **exclusivo Mooter** — "$0.004 · 96% local · 4090" |
**A tríade que impede o regresso ao Lovable:** (1) CC = melhor modelo → menos imports alucinados; (2) honest-copy → confiança, não ilusão; (3) multimodal + local-first $0 + prova de custo.

## 🎯 As lacunas dos concorrentes que o Mooter FECHA (red-team #3 — dores reais 2026, o pitch p/ novos users)
| Dor real (Lovable/Bolt/Cursor, fonte 2026) | Como o Mooter fecha na RAIZ |
|---|---|
| 🔥 **Credit burn** (queixa nº1: cada prompt/edit/bug queima créditos; 60-150 num bug loop) | **routing local $0** + Build Receipt prova "esta sessão custou $0" — o preview compara *"vs ~N créditos no Lovable"* |
| 🐛 **Bug loops / hallucinated fix** ("diz corrigido, o build falha") | **honest runtime capture** + CC verifica antes de declarar feito + **self-heal $0** (MP6) |
| 📉 **70% depois quebra** (o fix parte outra coisa) | CC (1M contexto) + testes + preview mostra a verdade a cada passo |
| 🚫 **Não importa projeto existente** (Lovable só cria do zero) | **vive no VS Code — funciona no TEU projeto** (Next/Vite já aberto), não só apps novas |
| 🏗️ **Sem SSR/mobile/debug avançado** | é o teu Next.js **real** (SSR nativo) + DevTools reais + local-first |
**Reposicionamento decisivo:** o Mooter NÃO é "um Lovable com CC" — é a **resposta às dores do Lovable**. Mesma magia visual, sem credit burn, sem preview que mente, no teu projeto real. É este o pitch para entrarem novos users.

## 🍷 Caso de uso #1 — dogfooding no `mooter.ai`
Correr a sessão a **melhorar a landing `mooter.ai`** (ex.: adicionar o `SavingsProof` ao hero — "🐮 saved $X today · Y% vs all-Opus, proven live on your GPU"). O Live Preview mostra a landing a montar-se + o Build Receipt a provar que a própria melhoria custou cêntimos. É a demo e o produto na mesma acção.

## 🔒 GUARD
`classify.js` FROZEN (sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`) · **read-only sobre o runtime** (nunca escreve no user code fora do que o CC já faz) · aditivo (só `packages/vscode-extension/**` + `tools/router/live-preview*` + deps novas justificadas) · **NÃO WebContainers** · honest-copy (`n/d`/advisory, nunca fabricar) · selective `git add` · **sem push/merge sem OK do Paulo** · PT-PT conversa / inglês código · `prefers-reduced-motion`.

## ✅ GATE global
Sessão frontend real → App Stage mostra a app ao vivo com HMR · click-to-edit salta para a linha certa · Director's Cut faz stream dos hooks reais · Build Receipt honesto (advisory vs real) · degrada gracioso em app não-web · `classify.js` intacta · 3 temas + `prefers-reduced-motion` · vsix instala e abre.

## 🕳️ Red-team — loop holes fechados (NÃO construir sem resolver estes)
1. **A ponte elemento→CC (o buraco central).** Os modos Select/Draw/Comment geram uma instrução, mas o CC é uma sessão de terminal — **sem injeção automática**. **MVP:** a instrução (+ `file:line` + sketch) vai para o **clipboard** + toast "cola no CC". **NEXT:** escrever `_handoff/live-preview/INBOX.jsonl` que um `sdk-runner` headless consome. **NUNCA fingir que o CC aplicou se não aplicou.**
2. **O iframe pode não carregar (X-Frame-Options/CSP).** Mitigar: (a) CSP do webview `frame-src http://localhost:*`; (b) garantir que o `landing/` dev NÃO envia `X-Frame-Options: DENY/SAMEORIGIN` (headers em `next.config` dev) OU proxy pelo webview. **Teste obrigatório no MP2: o iframe carrega mesmo.**
3. **Segurança do postMessage.** O webview SÓ aceita origin `http://localhost:<porta-detectada>`; **nunca `eval`/exec** do payload; só (a) abre `file:line` validado dentro do workspace, (b) copia texto p/ clipboard. Sanitizar sempre.
4. **Honest-copy dos números (não fabricar o "uau").** O Build Receipt mostra o custo **REAL** da sessão — Opus a $2 mostra **$2**, não "$0". O "uau, é grátis" só aparece quando o routing **de facto** poupou. A verdade é a feature.
5. **`events.jsonl` por-sessão + rotação.** Cada evento tem `session_id`; o painel **filtra pela sessão ativa** (senão mistura) e lê o **tail** (rotação ao fim de N linhas/M MB), nunca o ficheiro todo.
6. **Detector de porta robusto.** Cascata: (a) porta capturada do stdout → (b) `next.config`/`vite.config` → (c) comuns (7819/3000/5173) → (d) **override manual** (colar URL). Multi-projeto: segue o projeto ativo do `mode-registry`.
7. **Compat do inspector.** Confirmar `code-inspector-plugin` em **Next 15 + React 19** no MP3; fallback `react-dev-inspector` / `__source` puro. Não assumir.
8. **Gate de qualidade = HUMANO.** O "amigo não-dev de boca aberta" é validado pelo Paulo (demo/screenshot), **não auto-declarado pelo CC**.
> A ponte elemento→CC seamless (INBOX + sdk-runner) e o multiplayer são **NEXT, não MVP** — o MVP entrega com clipboard/paste, honesto.

## 📋 BACK
Por fase: branch (git-write worktree) · `git --no-pager diff --stat main..HEAD` (só adições) · testes · screenshot/GIF do App Stage a funcionar · confirmação sha intacta. `uncommitted` é o alerta vermelho. **Nada de merge — o Paulo autoriza o irreversível.**
