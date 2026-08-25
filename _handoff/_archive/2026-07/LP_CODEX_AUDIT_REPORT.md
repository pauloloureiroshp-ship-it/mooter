# Auditoria independente — Live Preview: experiência completa vs visão

**Data:** 2026-07-10  
**Auditor:** Codex, read-only sobre o produto  
**T1 instalado:** `C:\Users\Paulo Loureiro\frugal-w2` · `wave/w2-agent-bridge @ ae17c918` · VSIX declarada 0.16.65 · árvore limpa  
**T2 corrida:** `C:\Users\Paulo Loureiro\frugal-final` · `wave/lp-producao-perfeita @ 9b0e2cb` · dirty: apenas `packages/vscode-extension/package-lock.json` modificado  
**Guard:** `tools/router/classify.js` intacto nas duas árvores: `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`.

## Sumário executivo — 10 linhas

1. **VEREDITO: NO-SHIP para a promessa “melhor que o Lovable”**; existe um P0 no fluxo Security→Publish e nove dimensões ainda não passam integralmente.
2. O 🛡 não é pré-requisito do 🚀: sem scan ou com scan falhado, o host considera `hasOpenCritical=false` e permite commit/deploy; há ainda um `overrideCritical` aceito pelo host.
3. D1 falha: `#lp-controls` é um flex sem wrap; a única media query muda stage/rail, mas não os controles, e T2 alarga ainda mais a barra com “Review/Publish”.
4. D2 é parcial: stamp→AST e tree-gate são sólidos para JSX estático instrumentado, mas P1-5/P1-6 continuam abertos, multi-instância é ambígua e projeto sem tap falha em silêncio.
5. D3/F0.2 não existe: o feed guarda no máximo 50 escritas em RAM, sem identidade do nó, consulta por item selecionado ou persistência entre painéis.
6. D5 falha: nenhuma ação do Live Preview chama `hook-collector.appendEvent`; pin, prompt, edit, revert, security, publish e erro não entram no MEO/diário.
7. D4 está corrigida em T2 por `a06855c`, com prompt em foco e presets recolhidos; T1 instalada continua swatches-first.
8. O handoff de entrada está stale: F0.5.3 (`1907fa6`) e F0.5.4 (`9b0e2cb`) já estão na corrida, mas ambas são apenas parciais e não devem ser refeitas do zero.
9. D8 continua perigosa: a detecção mede TCP, pode trocar a porta morta por Docker `:3000`, e o novo semáforo omite o estado `tree:'unknown'` em vez de mostrar a quarta luz.
10. Testes e runtime não foram executados: `node` não existe no WSL e o PowerShell interop falhou; todos os veredictos abaixo são prova estática + repro determinístico, sem fingir execução.

## Veredictos D1–D10

| Dimensão | Veredicto | T1 instalada | T2 corrida | Razão curta |
|---|---|---|---|---|
| D1 Responsividade | **FAIL** | FAIL | FAIL | controles não quebram linha; presets 390/768 encolhem sem corrigir o rótulo |
| D2 Fidelidade da seleção | **PARTIAL** | PARTIAL | PARTIAL | pipeline estático bom; instrumentação/limitações/teste comportamental incompletos |
| D3 Histórico por item | **FAIL** | FAIL | FAIL | feed volátil e por escrita/ficheiro, não por nó; F0.2 ausente |
| D4 Prompt-first | **PARTIAL** | FAIL | **PASS por código/teste** | `a06855c` corrige T2; não instalado em T1 |
| D5 Registo no MEO | **FAIL** | FAIL | FAIL | Live Preview só lê o bus; não emite eventos para ele |
| D6 Security→Publish | **FAIL** | FAIL | FAIL | scan não obrigatório; falha abre gate; Critical é estreito e sobreponível |
| D7 Descobribilidade | **PARTIAL** | FAIL | PARTIAL | T2 adiciona keybinding, mas o botão visual segue anónimo |
| D8 Refresh inteligente | **PARTIAL** | FAIL | PARTIAL | T2 mostra porta/re-probe, mas sticky-port e `tree:unknown` continuam sem recuperação correta |
| D9 Ícones/animações | **PARTIAL** | PARTIAL | PARTIAL | motion reduction existe; semântica dos ícones e estados é inconsistente |
| D10 Honestidade/“melhor que Lovable” | **FAIL** | FAIL | FAIL | custo `$0` falso, HMR morto invisível, sem before/after renderizado |

## Estado real da corrida — deduplicação

| Frente | Commit T2 | Estado auditado | Não duplicar / trabalho residual |
|---|---:|---|---|
| F0.1 prompt-first | `a06855c` | **feito e coberto por teste de runtime** | não refazer; instalar/gatear |
| F0.3/F0.4 labels | `764062f` | **feito** | não refazer; rever impacto no overflow D1 |
| F0.5.1 janela sem pasta | `5ecebc3` | **parcial** | tela existe; corrigir ação `openRecent` e promessa “nesta janela” |
| F0.5.2 tri-state | `f19feed` | **feito** | não refazer |
| F0.5.3 quatro luzes | `1907fa6` | **parcial com bugs** | cobrir `tree:unknown`, ação SDK e sticky selection; não recomeçar |
| F0.5.4 descobribilidade | `9b0e2cb` | **parcial** | keybinding existe; falta CTA visual rotulado no Cockpit |
| F0.2 histórico por item | — | **ausente** | implementar conforme gap D3 |

## Achados detalhados

### D1 — Responsividade

**[D1 · sev P1 · ambas · evidência T1 `packages/vscode-extension/src/extension.js:2668-2715,2998-3002`; T2 `extension.js:2719-2767,3059-3062` · repro: abrir o panel a 1024 px e depois 821 px; `#lp-controls` permanece uma única linha intrínseca, corta/estoura enquanto o rail consome 340 px + padding · fix sugerido: tornar `#lp-controls` flexível com `flex-wrap`, agrupar ações e aplicar container query baseada no stage · já-na-corrida? não · confiança high]**

- `#lp-toolbar` tem `flex-wrap:wrap`, mas seu filho `#lp-controls` é `display:flex; ... flex:none` e não tem wrap. Portanto o conjunto inteiro é um item indivisível.
- A media query em 820 px apenas troca `#lp-root` para coluna; ela não altera `#lp-controls`, `#lp-url`, labels nem os botões de device.
- T2 torna o item ainda mais largo ao trocar 🛡/🚀 por `🛡 Review`/`🚀 Publish` (`extension.js:3084-3086`).

**[D1 · sev P1 · ambas · evidência T1 `extension.js:2670,2896-2899,3016-3018,4536-4544`; T2 `extension.js:2721,3077-3079,4652-4660` · repro: panel com 1024 px → stage ≈656 px após rail de 340 px + 28 px de padding; clicar “📱768” resulta iframe limitado por `maxWidth='100%'`, não 768 px · fix sugerido: mostrar largura efetiva e desativar/explicar presets impossíveis ou recolher o rail antes de aplicar 768 · já-na-corrida? não · confiança high]**

- O limiar físico para 768 px lado a lado é aproximadamente `768 + 340 + 28 = 1136 px`; entre 821 e ~1135 o botão promete 768, mas entrega menos.
- `📱390` e `📱768` usam o mesmo glifo; só o número diferencia.

**[D1 · sev P2 · ambas · evidência T1 `extension.js:2773-2777`; T2 `extension.js:2831-2834` · repro: estreitar o stage abaixo de 264 px e selecionar um nó; `.lp-ctb` mantém `min-width:248px` + bordas/padding dentro de overlay `overflow:hidden` · fix sugerido: remover o min-width rígido e empilhar row/buttons abaixo de 280 px via container query · já-na-corrida? não · confiança high]**

### D2 — Fidelidade da seleção

#### Pipeline comprovado

1. Dev-only webpack carimba `data-insp-path=file:line:col:tag` (`landing/next.config.ts:64-82`).
2. `resolve()` percorre `elementsFromPoint` e escolhe o primeiro elemento carimbado; se não houver, usa `closest('[data-insp-path]')` (`landing/app/_components/lp-error-tap.ts:592-604`).
3. `parseInspPath()` parseia da direita e preserva drive-letter Windows (`lp-error-tap.ts:185-199`).
4. O payload leva file/line/col/tag, texto renderizado, breadcrumb, contagem de instâncias e `servedRoot` (`lp-error-tap.ts:630-655`).
5. O host guarda a seleção e fail-closes prompts sem pin (`extension.js:1437-1461`); o tree-gate bloqueia árvore não confirmada (`extension.js:1429-1435`).
6. O AST localiza JSX pela linha, desempata por tag e coluna mais próxima (`live-edit-ast.js:73-99`); texto/classe dinâmicos são recusados (`live-edit-ast.js:103-145`).

**[D2 · sev P1 · ambas · evidência `landing/next.config.ts:64-82`, `landing/app/layout.tsx:5,128`, `lp-error-tap.ts:630-633` · repro: enquadrar um servidor genérico detectado em 5173/4321/8080 sem integrar `code-inspector-plugin` + `LpErrorTap`, armar 🎯 e clicar; nenhum `lp-select` é emitido e não há aviso de “seleção indisponível” · fix sugerido: adicionar handshake explícito `tap/instrumentation ready` como quinta condição ou bloquear 🎯 com instrução de integração · já-na-corrida? parcial (F0.5.3 tenta tree light, mas não cobre handshake) · confiança high]**

**[D2 · sev P1 · ambas · evidência `extension.js:3675-3683`; `webview-syntax.test.js:85-97`; `docs/strategy/LIVE_EDIT_ROADMAP.md:111-114` · repro: exercitar um nó próprio da página e um nó vindo de componente partilhado; não existe teste que execute os ramos positivo/negativo da heurística `parentCrumb.file !== sel.file` · fix sugerido: teste comportamental real de `renderSelection` para ambos os ramos e layout/page cross-file · já-na-corrida? não (P1-5 permanece) · confiança high]**

**[D2 · sev P1 · ambas · evidência `lp-error-tap.ts:670-679`; `extension.js:3684-3690`; `_handoff/LIVE_PREVIEW_AUDIT_FINDINGS.md:97-98` · repro: lista `.map()` com stamp repetido, array esparso `[, <b/>]` e overlay não carimbado; o painel avisa “TODOS”, mas não diz que re-select fixa a primeira instância, nem explica elisão/deepest fallback · fix sugerido: surface explícita para “primeira de N”, elisão e fallback; adicionar casos L1 reais · já-na-corrida? não (P1-6 permanece parcial) · confiança high]**

**[D2 · sev P2 · ambas · evidência `live-edit-ast.js:178-198,306-332`; `extension.js:3913` · repro: apagar JSX dentro de array/map; o motor só exige que o resultado parseie e pode deixar elisão válida, enquanto a UI dá apenas aviso genérico de expressão · fix sugerido: detectar `ArrayExpression`/elision e mostrar o diff semântico específico antes do apply · já-na-corrida? não · confiança high]**

Ponto positivo: T1 e T2 têm o mesmo hash para `lp-error-tap.ts` e `live-edit-ast.js`; não há regressão silenciosa da corrida nesse pipeline. Dinâmico não é vendido como sucesso simples: o host marca `model-applied-dynamic` e oferece agente.

### D3 — Histórico por item

**[D3 · sev P1 · ambas · evidência T1 `extension.js:1748-1771`; T2 `extension.js:1752-1775`; `lp-task-view.js:79-107` · repro: editar o mesmo nó duas vezes, selecionar outro nó e voltar; o feed só permite lista global por hora/via/ficheiros; fechar/reabrir o panel apaga tudo · fix sugerido: F0.2 deve persistir `nodeKey={servedRoot,file,line,col,tag}`, intent/prompt, diff/result, tier/cost, status e parent action, com consulta pela seleção atual · já-na-corrida? não · confiança high]**

Gap exato para F0.2:

- `_feedPush` cria `fN`, timestamp e cap de 50 **em memória**.
- `_feedView` expõe apenas `{id,ts,via,files,status,reason}`; perde file:line:col:tag, texto/prompt, before/after e relação com a seleção.
- Revert muta o item existente; não cria evento auditável separado.
- Ask sem escrita, pin, security, publish e erro não entram no feed.
- A spec deve distinguir “histórico por nó” de “lista de writes da sessão”; hoje só existe a segunda.

### D4 — Prompt-first

**[D4 · sev P1 · T1/T2 · evidência T1 `extension.js:3710-3748` coloca `lp-presets` antes do mode/prompt; T2 `extension.js:3822-3844,3864-3865`; teste T2 `live-preview-runtime.test.js:331-343` · repro: selecionar em T1 mostra swatches primeiro; selecionar em T2 foca `#lp-box-in`, deixa tiers abaixo e recolhe presets em “ajustes rápidos” · fix sugerido: manter a06855c e promover após gate/VSIX; não reimplementar · já-na-corrida? sim, `a06855c` · confiança high]**

T2 satisfaz o objetivo por código e teste existente. O teste de runtime verifica foco real no DOM fake e ordem prompt→tier→drawer, não só presença de string.

### D5 — Registo no MEO/diário

**[D5 · sev P1 · ambas · evidência `extension.js:1169-1220,2584-2591`; `hook-collector.js:173-196`; busca `HC.appendEvent` em `extension.js` = zero chamadas · repro: pin→edit→revert→security→publish e observar MEO/diário; só o feed em RAM muda · fix sugerido: emitir eventos LP tipados no bus com sid/nodeKey e projetá-los no diário, sem conteúdo sensível bruto · já-na-corrida? não · confiança high]**

| Ação Live Preview | Evento MEO/diário hoje | Onde aparece hoje | O que se perde |
|---|---|---|---|
| abrir panel / detectar porta | nenhum | status do próprio panel | abertura, porta escolhida, fonte, mismatch |
| pin/seleção | nenhum | SelectionStore + chips | identidade do nó, repeated, breadcrumb |
| edit texto/classe `$0` | nenhum | feed em RAM (`via/files/status`) | nó, before/after, prompt/intenção |
| delete `$0` | nenhum | feed em RAM | nó e semântica de delete |
| prompt local/cloud aplicado | nenhum | feed em RAM | prompt, tier/custo, diff aprovado |
| ask sem escrita | nenhum | resposta transitória | pergunta/resposta e evidência |
| agent task com edits | nenhum | feed em RAM + result panel | nodeKey e lifecycle completo |
| revert/keep | nenhum | status mutado no mesmo item | evento separado, autor/causa |
| security scan | nenhum | `_lastSecurity` + panel | scan start/end, cobertura, falha |
| commit/push/deploy | nenhum | publish popover | gate, resultado, URL, falha |
| runtime/build error | nenhum | faixa de diagnostics em RAM | erro, count, resolução |

O MEO atual é consumidor de `_handoff/live-preview/events.jsonl`; os produtores são hooks externos. O nome do diretório não significa que as ações do Live Preview sejam registradas.

### D6 — Security→Publish

**[D6 · sev P0 · ambas · evidência `extension.js:2018-2028,2065-2080,2130-2161`; teste `lp-publish-host.test.js:47-58,161-176` · repro: sessão nova, não executar 🛡, abrir 🚀, digitar o projectName exato; `_lastSecurity` é null→false e o teste happy-path prova que `vercel --prod --yes` é alcançado · fix sugerido: exigir scan válido, fresco e associado ao HEAD/touched-files antes de habilitar commit ou deploy; erro/ausência/stale = bloqueio · já-na-corrida? não · confiança high]**

Este é P0 porque a UI e a roadmap prometem “Critical bloqueia publish”, mas security nem sequer é uma etapa obrigatória. O teste de deploy feliz cria `fakeThis` sem `_lastSecurity` e espera spawn; isso é prova positiva do bypass, não inferência.

**[D6 · sev P1 · ambas · evidência `extension.js:2018-2028,2099-2107,2140-2148`; `lp-security-view.js:20-25`; `lp-publish-host.test.js:90-113` · repro: scan com npm audit critical/high ou enviar payload `overrideCritical:true`; o review chama ambos “Crítico”, porém o gate só lê `secrets[]`, e o teste prova que override alcança spawn · fix sugerido: uma enum única de gate severity; remover override do canal webview ou exigir confirmação host-native/human gate auditável · já-na-corrida? não · confiança high]**

- Scan falhado: `_lastSecurity={error:'scan-failed'}` e `_hasOpenCriticalSecurity()` retorna **false**.
- Npm critical/high aparece no grupo Crítico, mas não bloqueia porque o host só percorre `secrets`.
- `overrideCritical` não tem UI normal, mas é aceito pelo boundary host e testado como bypass.

**[D6 · sev P2 · ambas · evidência `extension.js:2665,2785-2800,4488-4532` (T1) / `extension.js:2716,2843-2858,4604-4648` (T2) · repro: iniciar security/commit/deploy; security mostra texto estático “a analisar…”, publish “a preparar…”, botões só ficam disabled, sem fases/progresso/cancel · fix sugerido: state machine visual scan→gate→commit→push→deploy com stepper e status real; manter o media query reduced-motion · já-na-corrida? não · confiança high]**

`prefers-reduced-motion` está respeitado globalmente e também nos spinners/pulses específicos; este subcritério passa.

### D7 — Descobribilidade

**[D7 · sev P1 · T1/T2 · evidência T1 `package.json:108-130`; T2 `package.json:108-139`, teste `lp-readiness-host.test.js:54-59` · repro: abrir Cockpit e procurar Live Preview sem hover/Command Palette; a ação `view/title` continua apenas `$(preview)`, enquanto T2 só acrescenta `Ctrl+K Ctrl+M` · fix sugerido: CTA visível “🎬 Live Preview” dentro do chrome do Cockpit, perto do projeto/refresh, mantendo palette + keybinding · já-na-corrida? sim, parcial em `9b0e2cb` · confiança high]**

O teste F0.5.4 prova título de command palette e existência de alguma keybinding; não prova o problema vivido — reconhecimento visual no header. Portanto o commit não fecha D7.

### D8 — Refresh inteligente

**[D8 · sev P1 · T1 · evidência `lp-stage.js:128-177,193-227`; `extension.js:1520-1553` · repro: deixar `:7819` morrer com Docker ouvindo em `:3000`; a nova probe escolhe o primeiro candidato vivo, enquadra Docker e mantém apenas prova TCP, podendo mostrar branco/wrong app · fix sugerido: probe HTTP com fingerprint/servedRoot e ação “esquecer porta + redetectar”, não apenas TCP · já-na-corrida? sim, parcial em F0.5.3 · confiança high]**

**[D8 · sev P1 · T2 · evidência `extension.js:2564-2600,3194-3226`; teste `live-preview-runtime.test.js:359-376` · repro: servidor 3000 sem `NEXT_PUBLIC_LP_ROOT`; `_readiness()` retorna `tree:'unknown'`, mas `renderReadiness()` não adiciona linha de árvore; o suposto semáforo de 4 luzes mostra 3 · fix sugerido: renderizar unknown vermelho/âmbar com “instrumentação ausente” e ação segura no workspace atual · já-na-corrida? sim, `1907fa6`, requer correção incremental · confiança high]**

**[D8 · sev P1 · T2 · evidência `extension.js:2590-2599,3208-3226` · repro: estado `sdk=false, trust=true`; UI mostra “sem SDK instalar”, porém `data-fix='folder'` envia `lp-open-folder`→`workbench.action.openRecent`; em mismatch com servedRoot irmão, restart usa o próprio `_servedRoot` errado como cwd · fix sugerido: ação SDK real/documentada e restart sempre no `_wsRoot()` confirmado, limpando sticky/override antes da probe · já-na-corrida? sim, `1907fa6`, bug dentro da implementação · confiança high]**

O “re-probar” atual zera routes e chama `_detectStage`, mas não limpa `stage.url` sticky; logo tende a escolher novamente a mesma porta/alternativa viva. A spec das 4 luzes precisa incluir: pasta, HTTP+fingerprint do dev server, árvore/tap handshake e agente; cada estado `ok/mismatch/unknown/off` deve renderizar exatamente uma luz.

### D9 — Ícones, animações e estados

**[D9 · sev P2 · ambas · evidência `extension.js:1323,2782,2987-2993,3014-3018,3056,3530-3568,6221` (T1; mesmas funções em T2) · repro: percorrer Cockpit→LP→pin→minimize→agent run; 🎬/🎞️, 🐮 e 🎯 mudam de significado por contexto · fix sugerido: vocabulário visual único com ícone + rótulo persistente para ações primárias e ícone reservado para estado · já-na-corrida? parcial (labels security/publish apenas) · confiança high]**

| Símbolo | Funções encontradas | Problema |
|---|---|---|
| 🎬 | comando/título Live Preview; empty App Stage | ação e estado misturados |
| 🎞️ | stream MEO; “só MEO” | quase sinónimo visual de 🎬 |
| 🎯 | selecionar nó; “Next prompt model” no Cockpit | pin visual e routing global colidem |
| 📍 | âncora do nó | coerente |
| 🐮 | local model, minimized edit toolbar, spinner/progresso, heartbeat MEO | identidade, botão e estado em um só glifo |
| 🛡 | review security | coerente; T2 ganhou label |
| 🚀 | publish/deploy | coerente; T2 ganhou label |
| 📱 | 390 e 768 | dois presets distintos com o mesmo ícone |
| 💻 | full-width | coerente |
| ↻ / Auto | re-probe / limpar override | relação e diferença pouco explícitas |

**[D9 · sev P2 · ambas · evidência `extension.js:2785-2800,2900-2915,2943-2964,4488-4507` T1 · repro: comparar agent task vs security/publish; task tem spinner/cancel/toast, security/publish só texto estático; empty/loading/error usam padrões diferentes por painel · fix sugerido: componentes partilhados `EmptyState`, `ProgressState`, `ErrorState`, `SuccessState` com motion opcional · já-na-corrida? não · confiança high]**

Animações úteis existentes: pulse de trabalho, spinner do agent e toast de resultado. Reduced-motion as desliga. O gap é coerência e feedback para security/publish, não ausência total de animação.

### D10 — Honestidade e distância para “melhor que Lovable”

**[D10 · sev P1 · ambas · evidência `lp-publish-view.js:59-72`; `extension.js:4133-4160` · repro: executar edit via Haiku/Sonnet/Opus e abrir Publish; o popover afirma “edições $0 · review $0 · deploy $0” embora edições cloud usem subscrição e deploy Vercel possa consumir quota/plano · fix sugerido: remover absolutos; mostrar custo observado por ação ou `n/d`, e “sem cobrança do Mooter” quando for essa a verdade · já-na-corrida? não · confiança high]**

**[D10 · sev P1 · T2 · evidência `extension.js:1574-1577,3287-3301`; teste `live-preview-runtime.test.js:345-356` · repro: clicar “Abrir a pasta do projeto nesta janela”; o host chama `workbench.action.openRecent`, que abre recents e não prova pasta nem mesma janela; o teste só prova a mensagem webview→host · fix sugerido: usar o comando de folder picker correto e testar o command id/resultado host-side · já-na-corrida? sim, bug em `5ecebc3` · confiança high]**

**[D10 · sev P1 · ambas · evidência `landing/app/_components/lp-error-tap.ts:393-417`; repro: matar/bloquear `/_next/webpack-hmr` mantendo HTTP/TCP ativo; `error` é engolido e não há `close`, logo stage continua “porta ativa” com conteúdo stale · fix sugerido: emitir `lp-hmr-health` com timeout/close e degradar readiness sem alegar frescura · já-na-corrida? não · confiança high]**

**[D10 · sev P1 · ambas · evidência `docs/strategy/LIVE_EDIT_ROADMAP.md:92-93`; `extension.js:3897-4013` · repro: aprovar uma mudança visual; a revisão é diff de linhas/JSX, não before/after renderizado do elemento · fix sugerido: before/after visual isolado e reversível antes do apply (LP-7), com fallback textual honesto · já-na-corrida? não · confiança high]**

**[D10 · sev P2 · ambas · evidência `extension.js:1292,2624` T1 / `extension.js:1292,2675` T2 · repro: inspeção estática; HOST_TOKEN e CSP nonce usam `Math.random()` em vez de CSPRNG · fix sugerido: `crypto.randomBytes`/`crypto.randomUUID` e teste de formato/entropia básica · já-na-corrida? não · confiança high]**

## Top-10 priorizado para o CC

1. **P0 — tornar 🛡 requisito host-side real:** no scan/error/stale/head-changed bloqueiam commit e deploy; remover bypass webview.
2. **P1 — corrigir F0.5.3 incrementalmente:** sempre quatro luzes; `tree:unknown` visível; SDK fix real; restart no workspace; limpar sticky antes de re-probe.
3. **P1 — fechar D1 com container queries:** wrap/grupos/overflow; testar 320/390/768/820/821/1024/1136/1440 e largura efetiva dos presets.
4. **P1 — implementar F0.2 por nó:** `nodeKey`, prompt/intent/diff/tier/status/revert, persistência e filtro pela seleção atual.
5. **P1 — emitir lifecycle LP no bus/MEO:** pin/edit/ask/revert/security/publish/error, com redaction e `sid`.
6. **P1 — fechar P1-5/P1-6:** testes comportamentais de component-scope e UI explícita para primeira instância, elisão e fallback deepest-pick.
7. **P1 — concluir F0.5.4 visualmente:** CTA rotulado dentro do Cockpit; conservar command palette/keybinding já commitados.
8. **P1 — instrumentação/HMR como readiness real:** handshake do tap + health do HMR; servidor genérico não pode parecer editável.
9. **P1 — retirar claims `$0` absolutos e corrigir open-folder:** custo observado/`n/d`; ação deve cumprir exatamente a copy.
10. **P1 — before/after renderizado (LP-7) + state machine de progresso:** aproxima experiência Lovable sem fabricar sucesso.

## O que não consegui verificar — e por quê

- **Nenhum teste Node foi corrido.** `command -v node` não retornou binário no WSL. O pedido autorizava Windows, mas `powershell.exe` falhou com `WSL UtilBindVsockAnyPort: socket failed 1`. Não instalei nada e não usei fallback que escrevesse.
- **Nenhum runtime/servidor foi iniciado**, por guard explícito. Não validei HMR real, Docker `:3000`, Vercel, npm audit, Agent SDK, port probes nem comportamento visual vivo.
- **Nenhuma screenshot foi capturada.** Os repros descrevem o estado visual esperado a partir das regras executadas, mas não são apresentados como captura observada.
- **Testes T2 citados são evidência de intenção/cobertura existente, não resultado desta auditoria.** Em especial, F0.1 tem teste comportamental; F0.5.3 testa apenas o fixture `tree:'mismatch'`, não o estado real `tree:'unknown'`.
- **Git foi lido sem escrita** usando o git-dir de cada worktree. T1 estava limpa; T2 tinha `packages/vscode-extension/package-lock.json` modificado. Não investiguei autoria nem corrigi.
- **Ledger agent-sync não foi gravado.** O pedido dizia “se disponível”, mas o guard final dizia “zero writes fora do relatório”; cumprir o guard mais restritivo impede o append mecânico. O relatório é o único arquivo escrito.
- **`classify.js` foi apenas hasheado**, nunca aberto para edição; SHA correta nas duas árvores.

## ⇄ MOO HANDOFF — para Paulo colar no Cowork

```text
⇄ MOO HANDOFF · frugal · auditoria independente Live Preview · 2026-07-10
STATE:  🔴 NO-SHIP para “melhor que Lovable” · auditoria concluída · produto untouched
TL;DR:  T1 instalada ae17c918 falha D1/D3/D5/D6; T2 9b0e2cb corrige prompt-first e já contém F0.5.3/F0.5.4, mas ambas são parciais. P0: Security NÃO é pré-requisito de Publish — no scan/scan error abre o gate; overrideCritical chega ao host. Relatório: _handoff/LP_CODEX_AUDIT_REPORT.md
── PARA TI ──
  1) CC começa pelo P0 Security→Publish, com scan válido/fresco/HEAD-bound e fail-closed.
  2) NÃO duplicar a06855c/764062f/5ecebc3/f19feed/1907fa6/9b0e2cb; iterar os gaps provados.
  3) Depois: F0.5.3 unknown/SDK/sticky, D1 responsive, F0.2 node history, eventos MEO, P1-5/P1-6, CTA visual.
  4) T2 está dirty apenas em packages/vscode-extension/package-lock.json; confrontar autoria antes de tocar.
ASK:    Paulo decide se o P0 bloqueia imediatamente a corrida e manda CC corrigir antes de qualquer polish/VSIX.
GATE:   relatório único escrito · zero edits no produto · zero installs/servers/deploys · testes não corridos por ambiente · classify.js SHA 427d8c0b…4bc48f intacta nas duas árvores · ledger não gravado por guard “zero writes fora do relatório”.
⇄ END HANDOFF
```
