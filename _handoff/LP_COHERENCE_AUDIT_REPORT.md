# LP Coherence Audit — Live Preview v0.16.66

**Data:** 2026-07-11  
**Modo:** auditoria read-only; nenhum código, configuração, dependência, servidor, commit, push ou deploy alterado  
**Artefacto auditado:** `C:\Users\Paulo Loureiro\frugal-final` · branch `wave/lp-producao-perfeita` · commit `d522ad8c4a639497f06bb29458c66ae8fe067874` · `packages/vscode-extension/package.json:5` = `0.16.66`  
**Régua:** `_handoff/LP_CODEX_COHERENCE_MASTERPROMPT.md` + `_handoff/LP_CODEX_AUDIT_REPORT.md` + handoffs LP existentes  
**Veredicto global:** **NO-GO para F3 enquanto COH-01 estiver aberto.** A geometria recomendada já está maioritariamente implementada, mas o vínculo `stage origin ↔ servedRoot ↔ selection` não é atómico. Depois de uma troca automática de porta, o preview pode mostrar outra aplicação e conservar autorização/seleção da árvore anterior.

## 0. Proveniência e confronto com o estado real

O masterprompt não estava na worktree de entrada `frugal-w2`; estava na árvore canónica `C:\Users\Paulo Loureiro\frugal\_handoff\LP_CODEX_COHERENCE_MASTERPROMPT.md`, com **10.850 bytes**, exactamente como indicado no handoff.

Há uma divergência material entre o handoff e a árvore canónica:

| Árvore | Branch/commit | VSIX | Estado útil para esta auditoria |
|---|---|---:|---|
| `frugal` | `wave/honest-controls @ eba5d3beaf4e` | 0.16.49 | não é o estado “post-PR #245 / v0.16.66” alegado; contém muitas alterações locais |
| `frugal-final` | `wave/lp-producao-perfeita @ d522ad8c4a63` | 0.16.66 | candidato coerente com o masterprompt; usado como fonte de verdade da auditoria |

`frugal-final` reporta `M packages/vscode-extension/src/extension.js`, mas `git diff --ignore-space-at-eol --quiet` devolveu 0: a diferença é apenas EOL/CRLF, sem diff semântico. Não a alterei. O estado remoto do PR #245 não foi consultado; “PR aberto” vem do handoff do Paulo e fica **n/d** nesta auditoria local.

O protocolo agent-sync exigia quatro artefactos que não existem nesta worktree: `_handoff/agent-sync/latest.md`, `_handoff/agent-context/bundle.md`, `docs/agent-context/AGENT_CONTEXT_PROTOCOL.md` e `tools/router/agent-sync-ledger.js`. Isto limita a proveniência cross-agent, mas não bloqueia a auditoria porque o masterprompt, os handoffs LP e o código candidato estavam presentes. Não criei ledger/checkpoint: o guard-rail desta tarefa permite **um único write**, este relatório.

### Anti-burn: o que não foi re-auditado do zero

O relatório anterior `_handoff/LP_CODEX_AUDIT_REPORT.md` foi usado como baseline. Os seus D1–D10 não foram repetidos mecanicamente. Revalidei apenas o que a auditoria de coerência D-A–D-L exigia ou o que mudou entretanto:

- **Entrou entretanto e tem prova positiva:** Security→Publish agora fail-closes sem scan/falhado/stale/Critical (`extension.js:2126-2152,2225-2236,2266-2286`; `lp-publish-host.test.js`); histórico por nó persiste (`extension.js:1787-1845,1869`; `lp-feed-persist-host.test.js`); eventos LP básicos chegam ao bus (`extension.js:1458,1486-1506,1796,1906,1922,2056,2236,2286`); HMR down/up tem reconnect limitado (`lp-error-tap.ts:404-435`); CSP nonce e host token são CSPRNG (`extension.js:1291-1295,2820,2858-2860`).
- **Continua aberto, citado e revalidado no commit actual:** “Abrir pasta” chama recents, não um folder picker (`extension.js:1604`); `tree:'unknown'` continua omitido na quarta luz (`extension.js:3368-3385`).
- **Novo nesta auditoria:** a transição entre origens/portas não invalida `servedRoot` nem seleção (COH-01); o MEO marca todas as acções LP como locais (COH-08); AUTO não usa o router Mooter (COH-09); URL de produção não existe antes do deploy e nem é link depois (COH-10/19).

## 1. Sumário executivo

1. **D-A:** H1 **REFUTADA**; H2 **CONFIRMADA com correcção obrigatória**; H3 **PARCIAL**. O prompt já está ancorado ao pin dentro do preview e o rail está adjacente à direita; não deve voltar ao cockpit esquerdo.
2. O floating prompt não esbarra hoje numa injecção dentro do iframe: vive na webview pai, sobre o iframe (`extension.js:2988-3005,3964-4052`). Logo CSP/concat-only são custo controlável, não razão para abandonar a disposição.
3. **P0 COH-01:** a autodetecção pode trocar `7819` por uma porta genérica viva, mas `_servedRoot`, `_selection` e `lpSelection` sobrevivem. O tree-gate pode continuar verde enquanto o iframe mostra outra aplicação.
4. **P1 COH-02:** a toolbar tenta quatro posições sem overlap, mas o fallback e a posição manual não repetem o teste; o teste “never covering” é estático e não prova a geometria final.
5. O inventário de controlos mostra wiring real na maioria dos casos; os principais controlos enganadores/silenciosos são “Abrir pasta”, Back/Forward sem tap e validações client-side de Publish.
6. O Context Engine está realmente ligado ao runner e testado: repo-map, import-slice e data-hop chegam ao agente. Não há prova de Notion, e a UI diz correctamente `Notion n/d`.
7. O fluxo Ask é cercado e zero-write, mas termina numa resposta sem CTA “Aplicar com o agente”; esta é a maior quebra do gesto perguntar→editar.
8. O MEO recebe alguns eventos LP, porém todos são gravados como `local:true`, `tier/model/cost:null`, inclusive agent/cloud/deploy; a narrativa de custo/modelo fica materialmente falsa.
9. `AUTO` é um alias fixo para Sonnet, não uma escada local→Haiku→Sonnet→Opus e não consulta o classificador. A escalação local→Sonnet é manual e não entra no MEO.
10. Publish bloqueia correctamente sem segurança fresca, mas não mostra o destino de produção antes do deploy; depois do deploy a URL é texto não clicável.
11. **Testes:** 318/318 `lp-*` + 111/111 complementares passaram; hash frozen intacto. Nenhum desses testes cobre o P0 temporal COH-01.
12. **Prioridade:** corrigir identidade transaccional do stage primeiro; depois toolbar/dock, Ask→Apply, telemetria/routing e destino de produção; só então produzir o mock final.

## 2. Master table — findings

| ID | Sev | Dimensão | Finding | Prova principal | Confiança |
|---|---|---|---|---|---|
| COH-01 | **P0** | D-D/D-E/D-G | troca automática de origem conserva root e pin antigos; preview e autorização podem divergir | `extension.js:1553-1568,2695-2712,3443-3488,4656-4659`; `lp-stage.js:193-227` | alta |
| COH-02 | **P1** | D-A/D-L | toolbar ainda pode cobrir o pin no fallback ou após drag; teste não executa a geometria | `extension.js:3764-3808`; `webview-syntax.test.js:407-425` | alta |
| COH-03 | **P1** | D-B/D-D | “Abrir a pasta” executa `openRecent`, não abre uma pasta nesta janela | `extension.js:1604,3457-3474` | alta |
| COH-04 | **P1** | D-B/D-D/D-G | quarta luz desaparece em `tree:'unknown'`; ausência de tap/handshake não é estado visual explícito | `extension.js:2691-2712,3368-3385` | alta |
| COH-05 | **P1** | D-D | multi-root escolhe sempre `workspaceFolders[0]`; não há selector nem vínculo ao editor/projecto activo | `extension.js:1331-1332` | alta |
| COH-06 | **P1** | D-D | “reiniciar dev server” usa `_servedRoot` potencialmente errado e não limpa sticky/root/selection | `extension.js:2714-2727` | alta |
| COH-07 | **P1** | D-E/D-L | resposta Ask não oferece “Aplicar com o agente” nem transição host-bound para Edit | `extension.js:4361-4407,4755-4761` | alta |
| COH-08 | **P1** | D-F/D-J | todos os eventos LP afirmam `local:true` e perdem tier/model/cost, inclusive agent/cloud/deploy | `extension.js:1486-1505,1796,2236,2286` | alta |
| COH-09 | **P1** | D-J | AUTO fixa Sonnet e não usa router/escada local-first; escalação é manual e salta Haiku | `live-edit-task.js:32-40`; `extension.js:4111-4118,4333-4357` | alta |
| COH-10 | **P1** | D-K/D-L | Publish não conhece/mostra o alvo prod antes do deploy, embora o repo tenha `mooter.ai` | `extension.js:1299-1301,2155-2206`; `INFRA.md:168-175` | alta |
| COH-11 | **P2** | D-B | Back/Forward postam para o tap sem capability/disabled reason; em app sem tap parecem funcionar e não fazem nada | `extension.js:3531-3535,4801-4804` | média-alta |
| COH-12 | **P2** | D-B/D-G | commit vazio e confirmação Vercel errada retornam silenciosamente, sem erro junto ao controlo | `extension.js:4836-4854` | alta |
| COH-13 | **P2** | D-C | vocabulário tier/model não é único: cores T0–T5, chips sem glifo e `famEmoji` colapsa Haiku/Sonnet/Opus em ✨ | `live-preview-view.js:224,287,362-382`; `extension.js:4440-4475,5994-5999` | alta |
| COH-14 | **P2** | D-C/D-G | trabalho usa spinner, pulse, cow estática e texto de botão sem uma state machine visual comum | `extension.js:3002-3017,3843-3855,4731-4754,4815-4854`; `live-preview-view.js:480-519` | alta |
| COH-15 | **P2** | D-F | bus não recebe prompt enviado, ask concluído, tier escolhido, falhas, cancel, keep nem fases start/end | chamadas `_emitLpEvent` em `extension.js:1458,1796,1906,1922,2056,2236,2286` | alta |
| COH-16 | **P2** | D-F | histórico guarda `servedRoot` e `col`, mas o filtro UI ignora ambos; árvores/nós homónimos podem misturar-se | `extension.js:1869,2586,3947-3962` | alta |
| COH-17 | **P2** | D-I | bridge/trust/SDK fica em cache 30s sem invalidation explícita após o utilizador corrigir o problema | `extension.js:2668-2689` | alta |
| COH-18 | **P2** | D-H | /skills funciona, mas está atrás de “ajustes rápidos” e não é sugerido contextualmente ao seleccionar | `extension.js:4038-4051`; `lp-skills.js:22-35,127-151` | alta |
| COH-19 | **P2** | D-K | URL pós-deploy é uma `<div>`, não um `<a>`; comentário afirma linkificação que não existe | `lp-publish-view.js:59-74` | alta |

**Contagem:** 19 findings — **P0: 1 · P1: 9 · P2: 9 · P3: 0**.

## 3. D-A — disposição esquerda vs direita

### Factos actuais

- O Live Preview é um `WebviewPanel` singleton no editor, aberto em `ViewColumn.Beside`, com `retainContextWhenHidden:true` (`extension.js:1270-1329`). Não é uma `WebviewView` fixa na Secondary Side Bar.
- Dentro da webview, o stage ocupa a esquerda e o rail de MEO/outputs fica adjacente à direita, 340 px (`extension.js:2814-2818,2864-2866`).
- O prompt e os chips vivem numa toolbar da webview pai sobre o iframe, ancorada ao rect do pin; não são injectados no DOM da app (`extension.js:2988-3005,3764-3808,3964-4052`).
- O rail da direita conserva contexto, diff, resposta e feed; os controlos de edição foram movidos para a toolbar (`extension.js:4000-4018`).

### Veredicto das três hipóteses

| Hipótese | Veredicto | Razão |
|---|---|---|
| H1 — edição na sidebar esquerda/cockpit | **REFUTADA** | recria o ping-pong ocular e mistura navegação/estado global com o gesto local de edição; o código actual já elevou o prompt para a selecção |
| H2 — prompt ancorado + rail adjacente direito; cockpit esquerdo só navega | **CONFIRMADA, com COH-01/02 antes do mock final** | é a menor distância olho→acção e já existe sem violar CSP; exige invalidation transaccional e fallback dock/minimize quando não houver espaço |
| H3 — editor tab Beside, persiste entre tabs/grupos | **PARCIAL** | `retainContextWhenHidden` preserva a webview em tab switch; comportamento exacto com dois editor groups não foi exercitado em GUI e fica n/d |

### COH-02 — prova de overlap

`positionCanvasToolbar` tenta above→below→right→left e rejeita overlap (`extension.js:3790-3805`), mas:

1. posição manual faz `return` logo após clamp e nunca testa overlap (`extension.js:3787-3789`);
2. se nenhuma posição cabe, o fallback faz clamp abaixo e não repete `lpRectsOverlap` (`extension.js:3806`);
3. o teste chamado “never covering the pinned node” apenas procura as strings da função e do `continue`; não instancia tamanhos nem verifica o resultado final (`webview-syntax.test.js:407-425`).

**Recomendação de disposição:** manter H2. Se não existir rect sem overlap, auto-minimizar para o chip junto ao pin ou dockar a toolbar no topo do rail direito; nunca fazer fallback sobre o nó. Custo estimado **S/M**, porque o host, o rect relay e o rail já existem. A solução continua concat-only/CSP-safe: nenhuma injecção no iframe é necessária.

## 4. D-B — inventário controlo → handler → efeito real

| Superfície | Controlos | Handler/efeito real | Estado |
|---|---|---|---|
| Top bar | Back, Forward, URL/Go, Routes, Auto, Redetect, Select, 390/768/full | navegação/reponto origin-locked, re-probe, select mode e largura do iframe (`extension.js:3233-3261,4792-4810,4859+`) | **PARCIAL**: Back/Fwd dependem do tap sem capability (COH-11) |
| Readiness | Abrir pasta, re-probar, reiniciar, confiar, como instalar SDK | mensagens host para commands/terminal/help (`extension.js:3368-3392,1573-1607,2714-2749`) | **PARCIAL**: openRecent e tree unknown (COH-03/04) |
| Diagnóstico | expandir/recolher, dismiss, abrir ficheiro, copiar | strip local + VS Code open/clipboard com erro honesto (`extension.js:3590-3604,2740-2767`) | **TEM** |
| Selecção/prompt | X, minimizar, drag, coach ?, Editar/Perguntar, input/send, AUTO/local/Haiku/Sonnet/Opus/@fable, refs | pin origin-locked; task/prompt host; chips desactivam com reason; cancel para agent (`extension.js:3964-4204,4438-4495`) | **TEM**, salvo overlap/routing |
| Ajustes | presets, texto, classe, /skills, abrir editor, apagar, breadcrumbs | preview/apply hash-gated; menu seeda one-box/tier; open/delete host-gated (`extension.js:4038-4100,4185-4204`) | **TEM**, skills pouco descobríveis |
| Resultado/feed | apply/cancel local, escalar Sonnet, manter/reverter all/per-file, feed revert | writes e reverts host-side com sha/registry (`extension.js:4209-4438`) | **PARCIAL**: Ask não tem Apply |
| Security/Publish | Review, fechar/abrir publish, commit+push, deploy open/cancel/confirm | scan local; security gate; selective commit; two-factor host (`extension.js:4811-4856`; `lp-publish-view.js:80-125`) | **PARCIAL**: validações silenciosas e destino ausente |
| MEO | Stream, Day, LLM, Fleet | troca de lente sobre factos agregados (`extension.js:3317-3328,3419-3435`) | **TEM**, mas eventos LP são incompletos/falsamente locais |

Não encontrei controlos puramente decorativos sem listener. Encontrei controlos com **efeito real diferente da copy** (COH-03), com **dependência não anunciada** (COH-11) e com **falha silenciosa** (COH-12).

## 5. D-C — linguagem visual: um conceito → um símbolo → uma cor

### O que passa

- Tiers têm cores textualmente redundantes em Brain/Day/Model; não dependem apenas de cor (`live-preview-view.js:224-236,287-320,362-390`).
- Valores desconhecidos usam `n/d`; custos estimados usam `~est.` (`live-preview-view.js:208-248,311-313,376-402`).
- Existe guarda global `prefers-reduced-motion` e guardas locais para spinner/pulse (`extension.js:2861,3002-3017`).
- A UI usa tokens VS Code na maioria dos fundos/foregrounds, com fallbacks.

### O que falha

Não há o dicionário único pedido (`🐮 local · ⚡ Haiku · 🎼 Sonnet · 🧠 Opus · 🌟 Fable`):

- chips do prompt: `🤖 AUTO`, `🐮 local`, nomes sem glifo para Haiku/Sonnet/Opus/Fable (`extension.js:4440-4475`);
- MEO: T0–T5 por cor + texto (`live-preview-view.js:362-382`);
- cockpit: `famEmoji` devolve `✨` para todos os Claude, só Fable recebe `🌟` (`extension.js:5994-5999`);
- `🐮` significa identidade Mooter, modo local, spinner, botão minimizado e heartbeat MEO (`extension.js:3013-3017,3282-3290,3317`; `live-preview-view.js:480-519`).

Isto não é apenas polish: no estado “a trabalhar”, o mesmo glifo pode significar actor, tier ou actividade. Recomenda-se um token semântico único por tier e um segundo token separado para estado (`idle/working/success/warn/error`), com texto sempre presente.

Contraste/light/dark visual real ficou **n/d**: não houve screenshot/GUI nesta auditoria. Os fallbacks escuros hardcoded (`#0B0A09`, etc.) merecem spot-check humano, mas não foram promovidos a finding sem prova visual.

## 6. D-D — zero-config, pasta/projecto e sticky-port

### Cenários pedidos

| Cenário | Resultado actual | Veredicto |
|---|---|---|
| 1. sem pasta | `_hasWorkspace=false`; empty screen e acção | **PARCIAL**: botão abre recents, não folder picker |
| 2. pasta certa, servidor errado | TCP pode detectar porta errada; tree-gate deveria bloquear quando novo tap envia root divergente | **FAIL temporal**: até esse novo handshake chegar, root/pin antigos sobrevivem |
| 3. pasta errada, servidor certo | `_treeConfirmed` bloqueia sibling/fora da lineage; testes positivos passam | **TEM** para snapshot estático |
| 4. multi-root | sempre `workspaceFolders[0]` | **NÃO TEM** resolução do projecto activo |

### COH-01 — P0: identidade não é transaccional

**Reprodução determinística da decisão de porta:**

```text
resolveStage({ stickyUrl:'http://localhost:7819', configPort:7819, livePorts:[3000] })
→ {"url":"http://localhost:3000","port":3000,"source":"probe","degraded":false,"stale":false,"reason":null}
```

O resultado foi executado contra `lp-stage.js` real. A partir daí, o wiring deixa estes estados divergirem:

1. `7819` válido envia `lp-ready`/`lp-select`; host grava `_servedRoot` e `_selection` (`extension.js:1302-1317,1450-1468,4656-4659`).
2. `7819` morre; uma app/Docker qualquer responde em `3000`; `resolveStage` escolhe o primeiro candidato vivo (`lp-stage.js:163-177,193-227`).
3. `_detectStage()` apenas substitui `this.stage`; não limpa `_servedRoot` nem `_selection` (`extension.js:1553-1568`).
4. `applyStage()` muda `curOrigin/src` e limpa erros/route state, mas não limpa `lpSelection`, refs ou toolbar (`extension.js:3443-3488`).
5. Se a nova app não inclui o tap Mooter, não envia novo `lp-ready`; `_readiness()` compara o root antigo com o workspace e pode continuar `tree:'ok'` (`extension.js:2695-2712`).
6. O one-box antigo continua com ficheiro/linha/tag; o tree-gate vê root antigo confirmado e pode editar o workspace enquanto o iframe mostra outra aplicação.

**Impacto:** quebra a promessa central “o que vês é o que editas” e reabre uma classe de write-on-wrong-preview. É P0 mesmo com todos os testes verdes.

**Fix mínimo seguro:** transformar identidade do stage num lease `{origin, servedRoot, readyEpoch}`. Sempre que `stage.url/origin` mudar: cancelar task, definir `_servedRoot=null`, `_selection=null`, limpar `lpSelection/lpRefs`, esconder toolbar e mostrar árvore “por confirmar”. Só um `lp-ready` origin-locked do iframe actual pode renovar o lease; nenhuma escrita parte antes disso. Re-probe deve validar handshake/app identity, não apenas TCP.

**Testes que faltam:**

- 7819 confirmado+pin → 7819 down + 3000 unrelated live → stage muda → root/selection são null;
- prompt pendente/após troca → `preview-tree-mismatch`/`no-selection`, zero write;
- nova origem só desbloqueia após `lp-ready` da origem actual;
- `tree:'unknown'` renderiza quarta luz e acção;
- restart corre no workspace escolhido, nunca no root servido divergente.

### Sticky-port e restart

`lp-stage.test.js` prova e espera que uma sticky URL morta seja conservada se nenhuma outra porta responder. Quando outra porta responde, ela vence. Isto ajuda HMR transitório, mas exige o lease acima. `restartDevServer` escolhe `_servedRoot` antes de `_wsRoot` (`extension.js:2722`) e não limpa estado antes da re-probe: no cenário de mismatch pode arrancar `npm run dev` justamente na árvore errada.

## 7. D-E — E2E seleccionar → prompt → executar → resultado

### Fluxo provado

1. `lp-error-tap.ts` carimba nós e envia selecção/rect/state a partir da app.
2. Webview aceita apenas `ev.source === iframe.contentWindow` e origin exacta (`extension.js:4633-4677`).
3. Host grava selection e root; write paths fail-close sem ambos (`extension.js:1302-1317,1437-1468`).
4. One-box envia `lp-prompt` local ou `lp-task` ask/edit (`extension.js:4101-4132`).
5. Context Engine calcula repo-map/import-slice/data-hop e passa `contextPack` ao runner (`live-edit-task.js:151-184`; `live-edit-context.js:205-274,297-340,480-496`).
6. Local devolve diff fenced; agente devolve answer ou edits; writes/reverts ficam host-side e sha-gated.

Provas executadas: testes de runtime mostram pin→prompt com feedback, envelopes da selecção e fail-closed sem pin; testes Context Engine mostram BFS/import slice, PageRank repo-map, data-hop e realpath fence; Ask nega Edit/MultiEdit e retorna zero writes.

### Elos quebrados

- **COH-01:** origem/root/pin não são uma única fonte temporal de verdade.
- O próprio comentário reconhece que SelectionStore ainda não é o único reader; ficheiro/linha/tag continuam a viajar em mensagens webview (`extension.js:1309-1316`).
- **COH-07:** `renderTaskResult` mostra answer e ficheiros lidos, mas só cria acções quando há edits. Não existe “▶ Aplicar com o agente” (`extension.js:4361-4407`).
- Alguns erros têm cause+action excelente em `showEditResult`; catches genéricos e validações Publish ainda degradam para erro/silêncio.

**Desenho host-side para Ask→Apply:** guardar no host, por `taskId`, `{selectionLease, instruction, answer, refs, filesRead, model}`. O CTA envia apenas `taskId`; o host revalida lease/root/trust e lança uma nova `_taskRun(intent:'edit')` com a pergunta+resposta guardadas. Não confiar em answer/instruction reenviados pela webview. Mostrar diff e manter/reverter como hoje.

## 8. D-F — registro, histórico e coerência MEO

### Matriz de eventos

| Evento | Feed por nó | Bus/MEO | Tier/model/custo honesto |
|---|---|---|---|
| pin | — | sim, deduplicado | n/a |
| edit determinístico/local | sim | sim | **não**: sempre null/local=true |
| agent edit | sim | sim | **não**: sempre null/local=true |
| revert | sim | sim | n/a |
| security scan | — | só resultado agregado | sem start/failure |
| commit+push | — | sim | sem fases/failure estruturado |
| deploy | — | sim | **não**: local=true, cost=null |
| prompt enviado/tier escolhido | — | **não** | não |
| Ask answer/failure/cancel | — | **não** | não |
| keep/revert task lifecycle | parcial | revert sim; keep não | não |

**COH-08:** `_emitLpEvent` ignora os fields de routing e grava literalmente `tier:null, model:null, cost:null, local:true` (`extension.js:1495-1505`). Como `_feedPush` chama isso também para `kind==='agent'`, uma edição Sonnet/Opus aparece local. Deploy também aparece local. O renderer MEO é honesto com os dados que recebe, mas o produtor está a fornecer factos falsos.

**COH-15:** falta um lifecycle coerente `started/progress/succeeded/failed/cancelled` com `taskId` e `action`, redacted. A lista actual de sete call-sites não cobre as decisões críticas.

**COH-16:** o nodeKey persistido inclui `servedRoot,file,line,col,tag`, mas `lpNodeHistoryHTML` filtra apenas `file/tag/line`. Deve comparar o lease/tree e col/stamp estável; line-based history desloca-se quando o ficheiro muda.

## 9. D-G — state machine visual

| Estado | Sinal actual | Veredicto |
|---|---|---|
| sem pasta/dev/tree/SDK | readiness chips | **PARCIAL**: tree unknown desaparece |
| seleccionado | moldura, anchor chip, toolbar | **TEM**, salvo COH-01/02 |
| prompt enviado | progresso imediato in-canvas | **TEM** |
| agente a ler/editar/deny | texto live + spinner/cancel | **TEM** |
| resultado edit | diff/feed/toast/flash | **TEM** |
| resultado Ask | resposta + toast | **PARCIAL**: sem Apply |
| segurança | “a analisar…” e resultado | **PARCIAL**: sem fase/progresso/failure lifecycle no MEO |
| publish | texto mutável do botão | **PARCIAL**: sem stepper scan→commit→push→deploy→live |
| stage troca de origem | src muda | **FAIL**: sem invalidation visual de root/pin |

Durante uma task `AUTO`, o utilizador vê “AUTO · subscrição”; o modelo real só aparece no resultado, embora o código já saiba que AUTO=Sonnet. Isto é uma omissão de estado, associada a COH-09. `prefers-reduced-motion` passa.

Recomendação: um reducer/state machine comum para `idle|blocked|working|success|warning|error`, actor/tier separado do estado, e timeline curta para operações globais. Animação só em `working`; success/error são transições finitas e textuais.

## 10. D-H — skills ao seleccionar

**Veredicto: PARCIAL.** A função existe e é segura:

- cinco defaults (`/icon`, `/copy`, `/restyle`, `/a11y`, `/section`), floors local/auto (`lp-skills.js:22-35`);
- override de `.mooter/skills` ou bundle, parsing/escaping testado (`lp-skills.js:39-117,127-151`);
- click seeda prompt e fixa floor; execução reutiliza write fences (`extension.js:3726-3762`).

Mas `/skills` só aparece depois de abrir `▾ ajustes rápidos` (`extension.js:4038-4049`) e não há sugestão derivada de tag/semântica/erro. Para a promessa “skills ao seleccionar”, mostrar 1–3 chips contextuais junto ao one-box (ex.: imagem→`/icon`/alt; heading→`/copy`; nó com a11y warning→`/a11y`), mantendo o menu completo no drawer.

## 11. D-I — backend, bridge, origin-lock e CSP

### Passa com prova

- Bridge distingue workspace untrusted, SDK ausente e disponível (`live-edit-cloud.js:51-65`).
- Cloud é trust-gated antes de spawn; runner tem timeout/kill e allowlist. Testes executados cobrem untrusted, SDK ausente, fake SDK, timeout e tier ladder.
- Host token e nonce usam `crypto.randomBytes`; CSP permite scripts nonce e frames localhost (`extension.js:1291-1295,2820,2858-2860`).
- Iframe relay exige source+origin exactos (`extension.js:4633-4677`).
- HMR down/up tem backoff limitado a seis tentativas (`lp-error-tap.ts:404-435`).
- Polling visível: snapshot conforme `data_.pollIntervalMs(true)`; stage sweep a cada 4s, cinco portas em paralelo, timeout TCP 500ms (`extension.js:1250-1265,2773-2777`).

### Gap

**COH-17:** `_leBridgeStatus` conserva qualquer resposta por 30s. Clicar “confiar” ou instalar o SDK não invalida `_leBridgeTs`; a UI pode continuar vermelha/desactivada por até 30s. Invalidar no `onDidGrantWorkspaceTrust`, na acção SDK/reprobe e ao mudar workspace.

O problema dominante de snapshot lento não é custo de poll, mas identidade: TCP só prova “porta activa”, facto que a copy declara correctamente (`lp-stage.js:247-250`), porém COH-01 deixa esse facto fraco herdar um root forte antigo.

## 12. D-J — handoff local/cloud e Context Engine

### Context Engine

**TEM e foi executado em teste.** `runTask` calcula `buildContextPack` antes de enviar stdin, com anchor source; o pack combina repo-map, import-slice e data-hop, bounded/fail-soft (`live-edit-task.js:151-184`; `live-edit-context.js:480-496`). A UI só mostra `repo ✓` quando o path de agente lê projecto e declara `Notion n/d` (`extension.js:3868-3874`).

### Routing/handoff

**NÃO está coerente com a tese Mooter:** `AGENT_MODEL.auto = claude-sonnet-4-6` (`live-edit-task.js:32-40`). Perguntar em modo local converte para AUTO/Sonnet (`extension.js:4111-4118`). Quando o local esgota qualidade, oferece manualmente Sonnet e salta Haiku (`extension.js:4333-4357`). Não há evento MEO de escalada nem motivo/tier/model/custo estruturado.

**Recomendação:** AUTO deve pedir ao router uma floor/rung com facts do pedido e do contexto, preservando as invariantes: local primeiro quando suficiente; T1/T2/T3 conforme risco/complexidade; T5 apenas `@fable`. Cada handoff emite `route_decided` e `escalation_offered/accepted`, com reason redacted e modelo real. O utilizador vê imediatamente `🐮 local $0 → ⚡ Haiku …` ou o tier decidido, não o rótulo abstracto AUTO.

### Latência

A UI mostra progresso antes do await (`extension.js:4117,4125,4129`), logo a resposta visual inicial é síncrona por código. Não medi tempo real e não afirmo `<1s`. O Context Engine é bounded, mas a alegação de poupar “20–52s” em comentário não foi benchmarkada nesta auditoria e fica **n/d**.

## 13. D-K — Publish e URL real de produção

### Segurança

O P0 anterior Security→Publish está **fechado no candidato**: commit/deploy exigem scan presente, bem sucedido, fresco e sem Critical; `overrideCritical` não abre o gate. A suíte executada prova no-scan, failed, stale, Critical, prod audit, nome errado/vazio e CLI ausente.

### Destino

`_lastDeployUrl` nasce null e só é preenchido por deploy bem sucedido nesta sessão (`extension.js:1299-1301,2183-2206`). Antes disso, Publish mostra “ainda sem deploy conhecido”. Porém o repo tem uma verdade explícita: `NEXT_PUBLIC_SITE_URL=https://mooter.ai` em `INFRA.md:168-175`, `landing/.env.local.example:7` e default `landing/app/lib/env.ts:36-39`. Não existe `landing/.vercel/project.json` nesta checkout.

**COH-10:** não mostrar o alvo antes do two-factor impede o utilizador de saber onde vai publicar. **COH-19:** depois do deploy, `lp-publish-view.js:69-74` emite `<div class="lp-pub-url">…</div>`; nenhum wiring converte em anchor, apesar do comentário.

**Resolução honesta recomendada:** introduzir uma fonte de configuração explícita e versionada para `productionUrl` (setting Mooter ou manifest de projecto), validada como HTTPS. Precedência: URL devolvida pelo deploy actual > productionUrl explícita > domínio consultado de Vercel quando disponível > `n/d`. Nunca derivar domínio de `projectName`, nunca hardcode genérico. Para este repo, o valor explícito é `https://mooter.ai`. Renderizar `<a href=...>` apenas para URL validada, com command/openExternal host-side se CSP exigir.

## 14. D-L — distância a Lovable/Cursor

| Padrão destilado | Estado | Evidência/gap |
|---|---|---|
| 1. selecção → prompt no mesmo gesto | **PARCIAL** | toolbar ancorada e autofocus existem; overlap/lease podem quebrar o gesto |
| 2. resultado com mínimo de passos | **PARCIAL** | local/agent têm diff/revert; setup SDK/trust e aprovação são explícitos, mas não mortos |
| 3. thread viva com passos/ficheiros/custo | **PARCIAL** | tool progress e filesRead existem; answer não é thread persistente; MEO falseia local/model/custo |
| 4. Ask → Apply imediato | **NÃO TEM** | resposta não cria CTA nem task host-bound de transição |
| 5. erro explica causa + próxima acção | **PARCIAL** | edit reasons/readiness são bons; Publish e Back/Fwd ainda falham silenciosamente |
| 6. estado do sistema num semáforo único | **PARCIAL** | pasta/dev/tree/agent modelados; unknown tree desaparece e lease stale pode ficar verde |
| 7. Publish mostra segurança + alvo prod | **PARCIAL** | segurança fail-closed passa; destino prod ausente e URL não clicável |

**Conclusão competitiva:** o candidato já tem uma base mais segura e transparente que um editor visual genérico em fences, trust e reversão. Ainda não pode alegar coerência superior enquanto a identidade do preview não for transaccional e enquanto Ask/MEO/AUTO/Publish quebrarem a continuidade do gesto.

## 15. Gap List priorizada para mock final e F3

| Ordem | Gap | Dono sugerido | Custo | Gate de aceitação |
|---:|---|---|---|---|
| 1 | **COH-01 lease origin↔root↔selection** | host + webview + tests | M | transição 7819→3000 não autorizado limpa pin/root e zero writes |
| 2 | COH-02 dock/minimize sem overlap real | webview geometry + runtime harness | S/M | testes geométricos com tamanhos; GUI 320/390/768/820/1024; nunca cobre pin |
| 3 | COH-04 quarta luz/handshake tap | readiness + runtime | S | unknown sempre visível e seleccionador desactivado com causa+acção |
| 4 | COH-03/05/06 project root correcto | host/workspace UX | M | folder picker real; multi-root escolhe projecto; restart só em root confirmado |
| 5 | COH-07 Ask→Apply host-bound | task registry + result UI | M | answer→Apply→diff, lease revalidado, webview não fornece payload confiável |
| 6 | COH-08/15 MEO lifecycle e routing truth | event schema/producer | M | cloud nunca local=true; tier/model/cost real ou n/d; start/end/failure/cancel |
| 7 | COH-09 AUTO router-native | router adapter + UI | M/L | local/T1/T2/T3 decisão provada; T5 apenas manual; escalação anunciada+registada |
| 8 | COH-10/19 destino prod | project config + Publish renderer | S/M | antes do deploy mostra alvo validado; após deploy link abre URL real |
| 9 | COH-11/12 honest controls | UI handlers | S | sem tap/entrada inválida: disabled ou erro inline; zero silent return |
| 10 | COH-13/14 state/tier tokens | design system + CSS | M | um glifo/cor/texto por tier; um state machine comum; reduced motion verde |
| 11 | COH-18 skills contextuais | selection UI | S | 1–3 sugestões junto ao prompt, menu completo no drawer |
| 12 | COH-16 history identity | nodeKey/filter | S | filtro usa lease/stamp/col e não mistura worktrees |
| 13 | COH-17 bridge invalidation | host events | S | trust/install/workspace change actualiza readiness imediatamente |

**Ordem para o mock:** representar primeiro o estado seguro pós-COH-01 e o fallback dock pós-COH-02; depois desenhar Ask→Apply, timeline MEO e Publish com `mooter.ai`. Não desenhar cockpit esquerdo como editor. Não esconder COH-04/10 em polish.

## 16. Testes, comandos e limites

### Executados

```text
"C:\Program Files\nodejs\node.exe" --test packages/vscode-extension/src/lp-*.test.js
→ tests 318 · pass 318 · fail 0 · duration 2123 ms

"C:\Program Files\nodejs\node.exe" --test \
  live-preview-runtime.test.js live-edit-context.test.js live-edit-task.test.js \
  live-edit-cloud.test.js live-preview-view.test.js webview-syntax.test.js
→ tests 111 · pass 111 · fail 0 · duration 2666 ms

sha256sum tools/router/classify.js
→ 427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f

resolveStage({stickyUrl:'http://localhost:7819',configPort:7819,livePorts:[3000]})
→ http://localhost:3000 · source probe · degraded false · stale false
```

O primeiro arranque de Node Windows dentro do sandbox falhou com `UtilBindVsockAnyPort: socket failed 1`; a mesma suíte foi reexecutada fora do sandbox, sem instalar nada, e passou. A suíte emitiu um `DEP0190` sobre child process com `shell:true`; não foi investigado por estar fora do escopo D-A–D-L e não afectou o resultado.

### O que os testes provam

- fences de árvore estática, sibling/descendant/case, selection gate, SHA stale, Ask zero-write;
- Security→Publish fail-closed;
- Context Engine e bridge/trust/timeout;
- origin/source lock, CSP nonce/token, HMR signal/reconnect;
- prompt-first, feedback, skills, reduced motion contract, webview parse;
- histórico/feed básico e alguns eventos LP.

### O que não provam

- COH-01 como sequência temporal no mesmo panel;
- geometria final da toolbar com dimensões reais; o teste COH-02 é presença de código, não layout;
- screenshots light/dark, contraste, scroll e polish no VS Code real;
- persistência em dois editor groups;
- fluxo vivo com Ollama/Agent SDK/Vercel/produção;
- latências `<1s`, HMR `<2s` ou poupança de contexto declarada em comentários;
- Mac/cross-device;
- estado remoto/merge do PR #245.

Nenhum servidor foi iniciado, nenhum deploy foi tentado e nenhum ficheiro de produto foi escrito.

## 17. Veredicto final

**D-A: H2 CONFIRMADA**, não H1. Manter: cockpit esquerdo como navegação/estado global; editor/preview em `Beside`; prompt flutuante ancorado à selecção; rail adjacente direito para contexto, thread, diff e histórico. Corrigir o fallback com dock/minimize.

**Gate:** **PÁRA antes do mock final até o relatório ser consumido.** Para implementação, COH-01 é bloqueador absoluto; COH-02/04/07/08/09/10 definem o mock final e a primeira wave. Security→Publish, Context Engine, fences e origin-lock não devem ser reconstruídos: devem ser preservados e estendidos.

**Confiança:** alta na auditoria estática e nos 429 testes executados; média no puro visual, explicitamente não observado em GUI.

---

⇄ CODEX→COWORK · LP-COERÊNCIA · relatório em `_handoff/LP_COHERENCE_AUDIT_REPORT.md` · **19 findings (1 P0 · 9 P1 · 9 P2)** · veredicto D-A: **H2 CONFIRMADA — prompt ancorado + rail direito, com lease de identidade e fallback dock obrigatórios**
