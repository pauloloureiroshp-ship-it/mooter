# ⇄ COWORK→CC · WAVE LP-2 · MP5.0+5.1 — Select-to-Edit (as features de EDIÇÃO do Live Preview)

> **Sessão 2 do Live Preview.** As features de VER estão todas em produção (`main @541acbb`: App Stage +
> honest-controls + error-strip + relógio local + multi-page nav). Falta a EDIÇÃO: **clicar num elemento do
> preview e editá-lo, com o chip de modelo router-native.** Lê `_handoff/LIVE_EDIT_MP5_SPEC.md` §3 e §5.2.
> Arquitectura Opus, código Sonnet. Aplica o PROTOCOLO à prova de erro (R1–R6).
>
> **NOTA sobre o WIP:** existe um `feat/live-edit @6d44ccd` (worktree `frugal-liveedit`) com uma tentativa
> anterior — mas foi construído sobre base ANTIGA (pré-MP4/MP3-v2) e o `extension.js` dele **colide** com o
> MP4 já em main. **Usa-o só como REFERÊNCIA; constrói limpo sobre `origin/main` atual** (R5). Não o mergees.

## 🛡️ PROTOCOLO OBRIGATÓRIO
- **R1:** `git fetch` ; `git worktree add -b wave/lp-mp5 ../frugal-mp5 origin/main` ; `cd` lá ; confirma `git rev-parse --show-toplevel` == `...frugal-mp5`.
- **R2:** commit atómico após CADA peça (antes de qualquer teste manual).
- **R5:** base = `origin/main` atual (541acbb, que já tem MP4 + MP3-v2).

## ▶ DO (por ordem; COMMIT após cada)
1. **Source mapping ($0, dev-only):** wire `code-inspector-plugin` em `landing/next.config.ts` →
   `turbopack.rules` (Next 15.5), dev-only, a carimbar `data-insp-path="ficheiro:linha:col:tag"`. (Ou um
   transform SWC próprio `data-mooter-src` se preferires zero-dep — decide e documenta.) **→ COMMIT.**
2. **Modo "select" no tap** (estende `landing/app/_components/lp-error-tap.ts`, o agente dev-only já injetado):
   hover-highlight (`capture:true`, `document.elementFromPoint`, overlay `position:fixed`+`pointer-events:none`
   em shadow DOM) + click → `closest('[data-insp-path]')` → `window.parent.postMessage({type:'lp-select',
   file, line, col, rect}, '*')`. **→ COMMIT.**
3. **Host recebe + click-to-code** (`extension.js` / `live-preview-view.js`): valida `event.origin` ==
   `localhost:<porta>`, mostra o elemento selecionado, botão **"abrir no editor"** (`vscode.window.
   showTextDocument` no `file:line`). **→ COMMIT.**
4. **Edit determinístico $0** (o fosso): painel inline (texto / cor / spacing / classe Tailwind) → o host aplica
   via **AST** (Babel parse + **recast** reimprime, muta só o nó por `data-insp-path`) → grava → HMR. **ZERO LLM.**
   **→ COMMIT.**
5. **Chip de modelo router-native:** mostra o tier que o `classify.js` (FROZEN, não tocar) atribui a esta
   edição, com **override manual** (ex: "Moo faz isto local $0 · [subir p/ Sonnet]"). Honest-copy no custo. **→ COMMIT.**

## 🔒 GUARD (R4)
`classify.js` FROZEN (sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`) · edits
determinísticos **NUNCA tocam LLM** · rollback atómico · `code-inspector` **dev-only** (dead-code em prod) ·
honest-copy no chip de custo · selective `git add` · **sem push/merge sem OK do Paulo** · toca só
`packages/vscode-extension/` + `landing/` · PT-PT.

## ✅ GATE
Clico num elemento do preview → abre o `file:line` certo no editor · mudo uma cor/texto → **patch AST $0, sem
tokens**, o HMR mostra a mudança · o chip diz "local $0" e deixa-me subir de modelo · `classify.js` sha intacta ·
testes verdes (extensão + landing) · `git status` LIMPO. PÁRA no gate; cola `git log --oneline` + testes + sha.

## ⏭ NEXT (Sessão 3, só depois desta aterrar)
MP5.2 (prompt estrutural → CC com SEARCH/REPLACE escopado + visual diff before apply) + MP5.3 (seleção de
ÁREA — marquee → screenshot recortado + DOM + multimodal). Detalhe no spec §3.3/3.5/3.6.
