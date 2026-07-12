# ⇄ CC→CODEX · LIVE PREVIEW · Handoff para a reorganização de pastas/estrutura do mooter.ai

> **Lê isto INTEIRO antes de mover um único ficheiro.** O Live Preview é o coração do Mooter agora e a
> sua cadeia funciona por **contratos de string (postMessage)** + **identidade de árvore servida** +
> **um entry-point de extensão**. Uma reorg de pastas parte isto **em silêncio** (testes podem continuar
> verdes e a feature morre ao vivo — foi exatamente o modo de falha que acabámos de fechar). Este handoff
> lista tudo o que fizemos + tudo o que **não pode partir**. Data: 2026-07-12.

## 0. TL;DR (o que não podes perder)
- Todo o trabalho desta sessão **já está committado** no branch `fix/lp-iframe-reload-rearm`
  (`ea65359` + `f05c2e9` + `06874cf`) e a branch está publicada no remoto. Nada fica por commitar exceto o
  `.vsix` (artefacto regenerável, gitignored); PR e merge continuam pendentes de autorização separada.
- **Suite: 1167/1167 verde. `classify.js` sha `427d8c0b…4bc48f` intacta.** Mantém ambos.
- A reorg tem **4 pontos load-bearing** (§4). Se moveres qualquer um sem seguir §5, o Live Preview morre.

## 1. Estado do repo AGORA
- Worktree: `C:\Users\Paulo Loureiro\frugal-lp-coerencia`
- Branch: **`fix/lp-iframe-reload-rearm`** · alteração funcional mais recente `06874cf` · base `origin/main`
  `89ff3e3` (PR #246 já mergeado) · branch publicada; PR/merge pendentes
- **12 worktrees registradas** (`git worktree list`) depois da remoção segura de 27 limpas — a reorg TEM de ser
  worktree-aware (ver §4-D). Ex.: `frugal` (wave/honest-controls), `frugal-w2` (wave/w2-agent-bridge) e esta árvore.
- `.vsix` é gitignored (artefacto de build). A mudança experimental de `landing/package.json`
  (`dev: -H 0.0.0.0`, era `-H 127.0.0.1`) foi isolada em `wip/landing-bind-all-interfaces @ 1f3b9a6` e não
  pertence a esta branch; não integrar sem decisão explícita sobre exposição de rede.

## 2. O que esta sessão entregou (provenance — não redescobrir nem desfazer)

| Commit | Conteúdo | Ficheiros |
|---|---|---|
| `ea65359` | **Fix #1** reload re-arm + **Fix #2** banner honesto + 4 testes + bump | `packages/vscode-extension/src/extension.js`, `…/src/live-preview-runtime.test.js`, `…/package.json` (0.16.68) |
| `f05c2e9` | consolidação docs/sync (Codex) | docs |
| `06874cf` | **integração host** pin recebido→gate→ficheiro pinado→undo limpo | `…/src/lp-cycle-e2e.test.js` |
| `f05c2e9` | nota de arquitetura H2 arquivada | `_handoff/_archive/2026-07/LP_H2_FLOATING_PROMPT_ARCHITECTURE.md` |

**Fix #1 — reload-desync** (`extension.js`, handler `lp-ready`): um reload completo do iframe reinicia o tap
in-page com select mode OFF; o host re-arma no handshake — `if(lpSelectOn) sendSelectMode(true)`. Sem isto,
o 🎯 fica aceso mas o clique morre (sem caixa nem chip). **Não remover.**

**Fix #2 — gate honesto** (`extension.js`, `applySelectCapability` + markup `#lp-select-blocked` + CSS): quando
`tree != 'ok'` o 🎯 é desativado; um botão nativo desativado não dispara clique, então a causa vivia só num
tooltip. Agora um banner assertivo nomeia a causa + botão de correção de 1 clique. **Nunca arma a seleção**
(gate de segurança intacto). **Não remover.**

**Descoberta H2** (ver `_handoff/_archive/2026-07/LP_H2_FLOATING_PROMPT_ARCHITECTURE.md`): a caixa flutuante ancorada JÁ tinha
sido entregue no PR #246 (camadas LP-4.8/4.9). A "H2.2" (desativar cockpit) é **moot por design** — o modelo é
pin-first fail-closed (nenhum prompt vai ao LLM sem pin). Não reconstruir uma caixa paralela.

**Verificação adversarial (3 lentes, 0 bugs):** seleção auto-pina (automático); todos os caminhos LLM/agente
têm o gate `_selectionMissing()` **antes** de qualquer `await`; todos os writes são contidos ao workspace
(`_within` + realpath + sha + tree gate) — sem write fora da árvore. O teste `06874cf` bloqueia a metade host
da cadeia; o relay DOM/tap/webview continua provado separadamente em `live-preview-runtime.test.js`.

## 3. Como o Live Preview funciona (mapa, para saberes o que estás a mexer)
```
[iframe: app dev instrumentada]                         [webview de confiança: extension.js]        [host: LivePreviewPanel]
 tap lp-error-tap.ts                                      script inline (getLivePreviewHtml)           classe LivePreviewPanel
  click → parseInspPath(data-insp-path) → file:line:col ── lp-select ──▶ lpSelection + renderSelection
                                                            └── lp-pin ─────────────────────────────▶ _setSelection (o PIN no código)
  arm ◀── lp-select-mode ── setSelectMode(🎯) ◀──────────── clique no 🎯 (gate: tree==='ok')
  handshake ── lp-ready ──▶ (Fix#1: re-arma) + ── lp-tree ─▶ _setServedRoot (identidade da árvore)
  prompt: input #lp-box-in ── lp-prompt/lp-task ───────────────────────────────────────────────────▶ _promptEdit/_taskRun
                                └ CTA ── lp-ask-apply ────────────────────────────────────────────────▶ _askApply→_taskRun
```
O **origin-lock** (`ev.source===frame.contentWindow && ev.origin===curOrigin`) filtra todas as mensagens do iframe.

## 4. LOAD-BEARING — o que uma reorg NÃO pode partir

### A. Entry-point da extensão + packaging
- `packages/vscode-extension/package.json` → **`"main": "./src/extension.js"`**. Se moveres `extension.js`, atualiza `main`.
- `packages/vscode-extension/.vscodeignore` — controla o que entra no VSIX; mantém `!node_modules/@babel/parser/**`
  e `**/*.test.js` excluído. Se `src/` mudar de sítio, atualiza os globs.
- `tools/router/classify.js` — **FROZEN**, sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`
  é CI-enforced. **Não mover, não editar** (ou atualiza a referência de sha no CI, mas o Paulo pediu FROZEN).
- Pacotes de engine congelados (`packages/*` das waves 28-34.5). Wave 58 só permitiu **adições** a `packages/router/src/`.

### B. Protocolo de mensagens (contratos de string — preservar VERBATIM)
Se refatorares o ficheiro que gera ou consome estes, as strings têm de continuar idênticas dos dois lados:
`lp-select` · `lp-pin` · `lp-select-mode` · `lp-select-mode-off` · `lp-ready` · `lp-tree` · `lp-nav` ·
`lp-edit` · `lp-prompt` · `lp-prompt-apply` · `lp-task` · `lp-ask-apply` · `lp-open-source` · `lp-pin-rect`.
Consumidor host: `extension.js` (routing ~1770-1781). Produtor/consumidor página: `landing/app/_components/lp-error-tap.ts`.

### C. Instrumentação da app previewada (o MAIOR risco — vive em `landing/`)
A seleção só funciona se a app previewada estiver instrumentada em **DEV**. Move `landing/` com CUIDADO extremo:
- `landing/app/_components/lp-error-tap.ts` — o tap in-page (select-to-edit + error relay). Resolve `data-insp-path`.
- `landing/app/_components/LpErrorTap.tsx` — mount DEV-ONLY (dead-code em produção; nunca serve a mooter.ai).
- `landing/app/layout.tsx` — monta `<LpErrorTap/>` (~linha 128). Se moveres o layout, mantém o mount.
- `landing/next.config.ts` — liga `code-inspector-plugin` via **hook webpack** (dev-only) que carimba `data-insp-path`,
  e expõe **`NEXT_PUBLIC_LP_ROOT`** = `process.cwd()` realpath (a **identidade da árvore servida**).
  - ⚠ **NUNCA** trocar o dev script para `--turbopack`: o inspector é um hook webpack; com turbopack `data-insp-path`
    deixa de ser carimbado → seleção morre em silêncio.
  - ⚠ `NEXT_PUBLIC_LP_ROOT` tem de continuar a resolver para a **raiz do workspace aberto no VS Code**. Se a reorg
    muda onde `landing/` vive ou o cwd do dev server, `tree != 'ok'` → 🎯 desativado (o banner do Fix#2 mostra isto).

### D. Consistência multi-worktree (a tua preocupação explícita)
O gate de identidade compara o **cwd do dev server** vs a **raiz do workspace** por **lineage de inode**.
Git worktrees são diretórios **irmãos sem lineage** → se o dev server correr de OUTRO worktree que o aberto no
VS Code, a seleção é (corretamente) bloqueada. Portanto:
- Faz a reorg de forma **consistente dentro de cada worktree** (não movas `landing/` num worktree e deixes o dev
  server a apontar para outro).
- Depois da reorg, o dev server tem de ser **rearrancado a partir da árvore reorganizada** para o handshake
  `lp-ready`/`lp-tree` re-confirmar `NEXT_PUBLIC_LP_ROOT === workspace`.
- Se propagares a reorg a vários worktrees, cada um precisa do seu próprio rearranque + re-verificação (§5).

## 5. PROTOCOLO DE VERIFICAÇÃO — corre isto DEPOIS da reorg (gate de "não parti nada")
```
1. cd packages/vscode-extension && node --test src/*.test.js        → TEM de dar 1167/1167 (0 fail)
2. sha256sum tools/router/classify.js                              → TEM de ser 427d8c0b…4bc48f
3. node -e "require('./packages/vscode-extension/package.json').main"→ o main aponta para o extension.js (movido?)
4. grep -c 'id=\"lp-select-blocked\"' <novo caminho>/extension.js   → 1  (Fix#2 vivo)
5. grep -c 'if(lpSelectOn) sendSelectMode(true)' …/extension.js     → 1  (Fix#1 vivo)
6. Protocolo idêntico dos dois lados:
   grep -oE "lp-(select|pin|select-mode|ready|tree|prompt|task|ask-apply)" …/extension.js  vs  …/lp-error-tap.ts
7. next.config.ts: code-inspector-plugin ligado (webpack) + NEXT_PUBLIC_LP_ROOT exposto; dev script SEM --turbopack
8. cd packages/vscode-extension && npx @vscode/vsce package        → o VSIX contém extension.js (ambos fixes) e 0 .test.js
9. LIVE (com o Paulo): reload VS Code → 🎯 arma → seleciona → caixa aparece; força reload → caixa sobrevive (Fix#1);
   dev server de outro worktree → banner honesto aparece (Fix#2).
```
Se **1** ou **2** falharem, **pára e reverte** — é regressão bloqueadora, não "nit para depois".

## 6. O que NÃO decidir sozinho (pergunta ao Paulo)
- Mover/renomear `landing/` (raiz da app de produção mooter.ai + toda a instrumentação de preview).
- Qualquer mudança a `tools/router/classify.js` ou aos pacotes de engine congelados.
- Merge de `fix/lp-iframe-reload-rearm` para `main` (abre PR, não faças merge direto).
- Trocar o build do dev server para turbopack.

## 7. Estado dos handoffs relacionados (não dupliques)
- `_handoff/_archive/2026-07/LP_H2_FLOATING_PROMPT_ARCHITECTURE.md` — onde vive a caixa flutuante + porque H2 já estava entregue.
- `_handoff/_archive/2026-07/LP_COHERENCE_AUDIT_REPORT.md` — a auditoria D-A–D-L (19 findings COH-01…19) que originou o PR #246.
- Este ficheiro — a fonte de verdade da reorg do Live Preview.

---
⇄ **CODEX→CC no fim**: confirma §5 (1..9) verde, cita o novo caminho de `extension.js` se o moveste, e **pára antes do merge**.
