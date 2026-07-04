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

## ▶ DO — 5 fases (worktree por fase, gate entre fases)
**MP0 · File-bus + Hook Collector** (`../frugal-lp-bus`, `feat/lp-file-bus`): o event collector (hooks → `events.jsonl`), contrato documentado no topo, fail-soft, zero impacto no runtime. **Gate:** eventos reais a escrever · `classify.js` sha intacta · sem tocar engine.
**MP1 · Painel + Director's Cut + Brain** (`feat/lp-panel`): comando `mooter.openLivePreview` + ícone na view; `src/live-preview-view.js` (concat-only, `fn.toString()` como `row-renderer`, fail-soft) → lê file-bus + `decisions.log` + snapshot. **Gate:** painel abre · Director's Cut faz stream do file-bus real · Brain mostra custo real/`n/d`.
**MP2 · App Stage** (`feat/lp-stage`): dev-server detector + `<iframe>` com `retainContextWhenHidden`; CSP `frame-src http://localhost:*`; HMR nativo. Degrada gracioso (não-web → só Director's Cut). **Gate:** um dev server Vite real aparece no iframe e faz hot-reload ao editar.
**MP3 · Click-to-Edit** (`feat/lp-inspect`): integrar `code-inspector-plugin` no dev server; inspect mode (hover outline), click→salta para o código, highlight de `FileChanged`; popover de custo advisory. **Gate:** clicar num elemento do preview abre o ficheiro na linha certa.
**MP4 · Build Receipt** (`feat/lp-receipt`): cartão partilhável (tier · $ · % local · GPU · 4090) + export PNG/GIF. **Gate de qualidade visual (obrigatório):** *um amigo não-dev fica de boca aberta e confortável?*

## 🍷 Caso de uso #1 — dogfooding no `mooter.ai`
Correr a sessão a **melhorar a landing `mooter.ai`** (ex.: adicionar o `SavingsProof` ao hero — "🐮 saved $X today · Y% vs all-Opus, proven live on your GPU"). O Live Preview mostra a landing a montar-se + o Build Receipt a provar que a própria melhoria custou cêntimos. É a demo e o produto na mesma acção.

## 🔒 GUARD
`classify.js` FROZEN (sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`) · **read-only sobre o runtime** (nunca escreve no user code fora do que o CC já faz) · aditivo (só `packages/vscode-extension/**` + `tools/router/live-preview*` + deps novas justificadas) · **NÃO WebContainers** · honest-copy (`n/d`/advisory, nunca fabricar) · selective `git add` · **sem push/merge sem OK do Paulo** · PT-PT conversa / inglês código · `prefers-reduced-motion`.

## ✅ GATE global
Sessão frontend real → App Stage mostra a app ao vivo com HMR · click-to-edit salta para a linha certa · Director's Cut faz stream dos hooks reais · Build Receipt honesto (advisory vs real) · degrada gracioso em app não-web · `classify.js` intacta · 3 temas + `prefers-reduced-motion` · vsix instala e abre.

## 📋 BACK
Por fase: branch (git-write worktree) · `git --no-pager diff --stat main..HEAD` (só adições) · testes · screenshot/GIF do App Stage a funcionar · confirmação sha intacta. `uncommitted` é o alerta vermelho. **Nada de merge — o Paulo autoriza o irreversível.**
