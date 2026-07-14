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
Se refatorares um produtor ou consumidor, cada contrato correspondente tem de continuar idêntico. **Não**
exijas ingenuamente que todas as strings existam nos dois ficheiros: `extension.js` contém tanto a webview
quanto o host, enquanto `lp-error-tap.ts` é apenas a ponta que corre dentro da página previewada.

- Tap → webview/host: `lp-error` · `lp-error-clear` · `lp-hmr-down` · `lp-hmr-up` · `lp-state` · `lp-nav` ·
  `lp-pin-rect` · `lp-attach` · `lp-select` · `lp-select-mode-off` · `lp-ready`.
- Webview → tap: `lp-select-mode` · `lp-detach` · `lp-detach-all` · `lp-preview-class` · `lp-preview-clear` ·
  `lp-flash` · `lp-reselect` · `lp-repin` · `lp-history` · `lp-restore`.
- Webview → host, dentro de `extension.js`: `lp-tree` · `lp-pin` · `lp-edit` · `lp-prompt` ·
  `lp-prompt-apply` · `lp-task` · `lp-ask-apply` · `lp-open-source` e os restantes contratos do routing host.

`lp-tree` e `lp-pin` são relays internos derivados de `lp-ready`/`lp-select`; não são esperados como literais no
tap. Consumidor host: `extension.js` (routing ~1738-1790). Ponta da página:
`landing/app/_components/lp-error-tap.ts`.

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

## 8. Veredito de alocação após confronto CC ↔ Codex (2026-07-12)

**Não mover o Live Preview nesta branch.** A estrutura atual é coerente e os gates mecânicos confirmaram:
entrypoint resolvido, os dois fixes presentes exatamente uma vez, 11 tipos tap→webview/host e 10 tipos
webview→tap cobertos, nenhum candidato órfão entre os módulos runtime `lp-*`/`live-edit-*`, mount DEV,
webpack, `NEXT_PUBLIC_LP_ROOT`, regras de packaging e SHA congelado intactos.

| Componente | Local canónico nesta wave | Decisão |
|---|---|---|
| Host + webview | `packages/vscode-extension/src/extension.js` | manter; é o `main` |
| Módulos Live Preview | `packages/vscode-extension/src/lp-*.js` | manter flat; já estão separados por responsabilidade |
| Engine Live Edit | `packages/vscode-extension/src/live-edit-*.js/.mjs` | manter flat; dependências relativas verificadas |
| Assets | `packages/vscode-extension/assets/live-edit/` | manter |
| Tap dentro do iframe | `landing/app/_components/lp-error-tap.ts` + `LpErrorTap.tsx` | manter na app |
| Hook tap → bus | `tools/router/live-preview-tap.js` | manter; listado em `sync-hooks.js` |

### Armadilhas para uma reorg futura

1. `extension.js` tem 7368 linhas, mas um split agora é refactor de alto risco e sem valor funcional desta wave:
   o entrypoint, `fn.toString()` concat-only, nonce/CSP e o routing host/webview formam um só contrato. Tratar
   eventual split como wave própria, com harness runtime e packaging completo.
2. Reagrupar `src/` em subpastas exige atualizar **todos** os `require('./…')`, o `main`, `.vscodeignore`,
   imports dos testes e voltar a provar a suíte completa + conteúdo do VSIX. Não fazer como limpeza cosmética.
3. `landing/app/_components/` é load-bearing: preservar o mount no layout, o inspector webpack — nunca trocar
   silenciosamente para Turbopack — e `NEXT_PUBLIC_LP_ROOT` identificado com a árvore servida.

### `vscode-extension/` top-level: legado, mas **não apagar nesta branch**

O achado inicial chamou `vscode-extension/extension.js` de ficheiro solto. O confronto provou que a pasta é
uma segunda extensão rastreada, com manifesto próprio: `mooter-savings@0.5.2`, publisher `mooter`, `main` em
`./extension.js`, activation `onStartupFinished`, três comandos e configurações `frugal.*`. Ela não participa
do Live Preview e o workflow atual de marketplace publica apenas `packages/vscode-extension` (`mooter-cockpit`),
mas mantém comportamentos antigos próprios — toasts, resumo e abertura de `decisions.log`.

Evidência histórica diz que o pacote antigo era VSIX local e **não tinha sido publicado**; busca pública atual
encontrou o `mooter-cockpit`, não uma listing `mooter-savings`. Isso reduz o risco, mas não prova ausência de
instalações manuais. A inspeção desta máquina provou justamente uma instalação presente/preservada:
`frugal.frugal-savings-0.5.2`, ao lado de `mooter.mooter-cockpit`. O `extension.js` instalado é byte-identical
ao source do repo (SHA-256 `c5a8e718…aef5`), enquanto o manifesto instalado ainda diz `frugal/frugal-savings`
e o manifesto do repo já diz `mooter/mooter-savings`. Logo, o rebrand mudou a identidade de atualização e a
pasta é hoje a única fonte rastreada para compreender ou migrar essa instalação.

Remoção só numa PR de depreciação separada, depois de:

1. decidir e executar a migração/desinstalação de `frugal.frugal-savings-0.5.2` nas máquinas do Paulo;
2. decidir explicitamente se os comportamentos exclusivos serão migrados ou abandonados;
3. confirmar pela conta do publisher se alguma das identidades `frugal.frugal-savings` ou
   `mooter.mooter-savings` existe no Marketplace/Open VSX;
4. remover **a pasta inteira** (`extension.js` + `package.json`) e validar que onboarding/release não dependem dela.

Até esse gate: manter a pasta como legado identificado; não misturar sua remoção com a reorg do Live Preview.

## 9. MEO Control Tower — tracking CTO sem reorg destrutiva (2026-07-12)

A evolução do MEO ficou **aditiva** e respeitou a decisão do §8: `extension.js` continua como entrypoint
monolítico, os módulos `lp-*` permanecem flat e a landing instrumentada não foi movida. A candidata `v0.16.69`
acrescenta duas lentes (`Control`, `Sessões`) e transforma `Stream` numa timeline unificada.

Fontes cruzadas, com proveniência visível:

- `_handoff/live-preview/events.jsonl`: atividade runtime/ficheiros, sem autoria inventada;
- `~/.claude/hooks/execution.log`: operações, modelo e session id realmente executados;
- catálogo leve dos transcripts VS Code: título/modelo/cwd, sem Git/gh/network no poll do painel;
- `_handoff/agent-sync/events.jsonl`: autoria/handoffs/wave/PR/canal tipados;
- mode registry: timestamps/referências já existentes de Notion e Obsidian;
- `_handoff/fleet/*`: estado da frota, preservando `n/d` quando não há heartbeat.

O Ledger vive em `_handoff/agent-sync/`, está gitignored e produz JSONL append-only, snapshot, `latest.md`,
prompts por agente e briefs por destinatário. O Stop hook `gsd-turn-end.js` registra um checkpoint Claude
compacto (session id/título/modelo), sem copiar prompt ou resposta e sem subprocessos Git. O protocolo canónico
está em `docs/agent-context/AGENT_CONTEXT_PROTOCOL.md`; regras de consumo estão em `.claude/skills/agent-sync/`
e `.roo/rules/`.

Gates executados no Windows Node:

- extensão: **1176/1176 pass**;
- Stop/handoff/Ledger: **77/77 pass**;
- `moo-verify`: **12/12 pass** após normalizar o código de comando ausente do Windows;
- classificador: SHA congelado deve ser confrontado novamente imediatamente antes do commit/push;
- Notion HQ e vault Mooter: **NO ACCESS** nesta sessão; apenas sinais locais existentes são mostrados.

## 10. Live Preview `v0.16.70` — localhost automático e refresh determinístico (2026-07-12)

O falso-verde TCP/HTTP 500 foi fechado com validação HTTP real: só 2xx HTML enquadrável entra no iframe.
A descoberta sonda em paralelo a porta configurada e os defaults/ranges auto-incrementados de Next, Vite,
Astro, Angular, Workers e servidores genéricos, tentando loopback IPv4 e IPv6 sem divergir o `Host` validado
da autoridade `localhost` enquadrada.

O ↻ agora é uma intenção forte: recarrega o iframe mesmo quando a URL não mudou, invalida cache de rotas/bridge,
ignora identidade sticky e enfileira exatamente uma nova sondagem se houver outra em curso. Geração latest-wins
impede o resultado antigo de sobrescrever a intenção nova; override inalcançável pode cair para o localhost
real, enquanto HTTP 4xx/5xx positivamente observado continua bloqueado e explícito.

Guardrails adicionais: redirects `localhost ↔ 127.0.0.1` são recusados; múltiplas políticas CSP são tratadas
como interseção; workspace untrusted nunca executa `npm run dev`; restart só mata LISTEN PID quando comando/cwd
prova ownership do pacote selecionado. Gate Windows Node com HOME isolado: **1202/1202 pass**; focused recovery:
**96/96 pass**; landing: **211/211 pass**; `classify.js` congelado intacto.

---
⇄ **CODEX→CC no fim**: confirma §5 (1..9) verde, cita o novo caminho de `extension.js` se o moveste, e **pára antes do merge**.
