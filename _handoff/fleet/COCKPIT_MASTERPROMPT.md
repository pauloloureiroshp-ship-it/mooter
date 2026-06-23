# MASTER PROMPT — Cockpit "Auto-pilot por sessão" (igualar o mockup, pixel a pixel)
# Cola numa sessão CC NOVA, no repo ~/frugal, branch wave-WCOCKPIT, plugin Mooter.

És o Claude Code nesta sessão. Trabalha SÓ na branch `wave-WCOCKPIT` do repo ~/frugal. Objetivo: a
UI do cockpit do plugin (`packages/vscode-extension`) tem de IGUALAR o design aprovado. A camada de
dados já existe em `src/mode-registry.js` e `src/cowork-waiting.js` (usa-os; não os reescrevas sem
necessidade). O que falta é a RENDERIZAÇÃO no webview (`src/extension.js`: `getHtml()` + a função que
desenha cada live session, tipo `rowFor`). Mostra-me tudo (raciocínio, diffs) e PÁRA para eu validar
por screenshot a cada iteração — iteramos até ficar perfeito.

## ESPEC VISUAL — cada card de live session (igualar exactamente)
- **Avatar 🐮 animado pelo MODO da sessão** (lê `mode-registry.get(sid).mode`):
  - lazy → `moolazy` (balanço lento ~2.4s) + sufixo 💤
  - moo  → `moowalk` (~0.85s)
  - crazy→ `moocrazy` (rápido ~0.4s) + sufixo ⚡
  - animar só quando a sessão está `working`. Respeitar `prefers-reduced-motion`.
- **Título** (bold, ellipsis) + **badge de estado** à direita:
  working (verde) · your turn (âmbar) · **waiting for Cowork — <brain>** (azul, via `cowork-waiting.badge`) · auto-answered (azul ✓).
- **Linha meta** (wrap): `brain: <título da conversa Cowork>` (azul, ícone msg) · **modelo como dropdown clicável** ("Opus 4.8 ▾") · 🕒 `lastActiveTs` ("29m ago") · **Notion mini-SVG** (quadrado+N, currentColor) + tempo de sync ("3h") · **Obsidian mini-SVG** (gema roxa) + tempo · botão **↺ refresh** · chip **⌥ wt:<nome>** se a sessão estiver num linked worktree.
- **Linha de controlos**: segmented **[💤 Lazy | 🐮 Moo | ⚡ Crazy]** (activo = mode da sessão) + **toggle auto** à direita.
- **AGRUPAR POR PROJETO Cowork** (`registry.project`: "Mooter.ai", "Cloude Home"…), NÃO pelo repo. Header
  por projeto: chevron + nome + "N sessions · M needs you". Sessão sem project → grupo "Unassigned" + CTA "link a Cowork brain".
- Mini-SVGs: Notion = `<rect rx=4 stroke=currentColor/> + N`; Obsidian = polígono/gema roxa. NADA de "link" genérico.

## INTERACÇÕES (CSP-safe: data-attrs + listener delegado, nonce; SEM onclick inline)
setMode(sid,mode) · setModel(sid,model) · setAuto(sid,bool) · refreshIntegrations(sid) (→ `mode-registry.touchSync`)
· toggleProject(name). Persistir UI (grupos abertos) em `~/.mooter/preferences.json`.

## GAP ACTUAL (o que está instalado e NÃO bate certo — corrige isto)
Hoje renderiza: agrupado por repo "FRUGAL", "29m ago", branch+PR, e "link link ↺" genérico. FALTAM:
selector de modo por sessão, modelo-dropdown por sessão, toggle auto por sessão, vaquinha animada por modo,
logos Notion/Obsidian + sync, chip worktree, agrupar por projeto Cowork, brain title, estado waiting-for-cowork.

## VERIFICAÇÃO (obrigatória — não declarar pronto sem isto)
1. Testes ao NÍVEL DO HTML: assert que `rowFor(sampleRow)` contém o segmented de 3 modos (activo certo),
   a classe de animação por modo, o dropdown de modelo, o toggle auto, os 2 SVG (Notion+Obsidian)+tempo+↺,
   o chip wt: quando há worktree, o brain title, e que o agrupamento usa `registry.project`. + unit existentes. Todos verdes.
2. `vsce package` na `packages/vscode-extension` para gerar o `.vsix`.
3. PÁRA e diz-me: "pronto para reload" — eu instalo, recarrego e mando-te o screenshot. Comparas ao spec e corriges o que faltar. Repetir até pixel-match.

## REGRAS DURAS
classify.js FROZEN (sha 427d8c0b...364bc48f — prova no fim, intacta). 100% ADITIVO (só src/ do extension + ficheiros novos). git add selectivo. NUNCA merge/push/tag/deploy para main (gate humano — reporta em BLOCKERS). Escrita de JSON sempre atómica (tmp+rename). Termina com bloco status (DID/TESTS/BLOCKERS/NEXT/DONE).

## EXTRA (também implementar) — estágio git + worktree visual
- **Estágio git por sessão** (salvaguarda): helper `gitStage(cwd)` (status --porcelain + rev-list ahead/behind, read-only, never-throws). Chip por card: ✓ clean · ● N uncommitted (âmbar) · ◐ staged · ↑N to push. Dica "⚠ trabalho por guardar — não fechar" quando dirty>0/ahead>0. Para o vibe coder não fechar sessões e perder trabalho.
- **Worktree visual**: sessões no mesmo worktree partilham chip "⌥ wt:<nome>" + accent de cor por worktree (border-left, sem cantos arredondados). Header conta "N em wt:X".
- Testes ao nível do HTML para ambos.
