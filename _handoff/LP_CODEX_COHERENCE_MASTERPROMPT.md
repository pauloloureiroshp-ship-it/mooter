# ⇄ COWORK→CODEX · LP-COERÊNCIA · Super-auditoria de coerência geral do Live Preview (read-only)

> **Cola este ficheiro inteiro no Codex.** Auditoria total de coerência UX/UI/backend do modo Live Preview do Mooter.
> O Live Preview é o cartão de visita do produto. O objetivo desta auditoria é encontrar TUDO o que impede a experiência de ser nível Lovable/Cursor — antes de escrevermos uma linha de código de melhoria.

---

## GOAL
Produzir `_handoff/LP_COHERENCE_AUDIT_REPORT.md` com findings provados (ficheiro:linha + prova positiva) em 12 dimensões de coerência (D-A…D-L abaixo), classificados P0–P3, mais uma secção final "GAP LIST vs Lovable/Cursor" priorizada. Este relatório alimenta: (1) o mock final da experiência, (2) o masterprompt de implementação. Não implementes nada — só auditas.

## WHERE
`C:\Users\Paulo Loureiro\frugal` — branch atual (pós PR #245, extensão 0.16.66).
Ficheiros-chave já conhecidos: `extension.js` (~495KB, cockpit + renderers), `live-edit-ast.js`, `live-edit-cloud.js` (bridgeStatus), `lp-error-tap.ts`, `lp-publish-host.*`, testes `lp-*.test.js`, `_handoff/LP_CODEX_AUDIT_REPORT.md` (a tua auditoria anterior — NÃO re-auditar D1–D10), `_handoff/LIVE_PREVIEW_COWORK_PERFECT_HANDOFF.md` §5 (régua do perfeito), `_handoff/LIVE_PREVIEW_FABLE5_MASTER_HANDOFF.md` §2.96–§2.97 (decisões e plano).

## GUARD (inegociável)
- **Read-only absoluto**: zero writes no repo. Única escrita permitida: o relatório em `_handoff/`.
- `classify.js` FROZEN — não tocar, não propor mudanças ao motor de classificação.
- Honesty-first: finding sem prova = não existe. Escreve `n/d` quando não conseguires provar. NUNCA inventes números, percentagens ou comportamento não observado.
- Anti-burn: zero re-recon do que já está provado nos relatórios existentes. Se um facto está em `LP_CODEX_AUDIT_REPORT.md` ou no MASTER_HANDOFF, cita-o, não o redescubras.
- Formato de prova: `ficheiro:linha` + o quê (grep hit, teste que corre, execução com output). Para claims de UX, cita o código do renderer que produz o elemento.

---

## AS 12 DIMENSÕES (D-A … D-L)

### D-A · Disposição e geografia da interface (advogado do diabo)
Hipóteses a validar contra o código real (onde cada painel monta, distâncias de olho/rato):
- **H1 — prompt longe da seleção.** Hoje: seleciono um elemento no preview (painel central/direito) e o prompt vive no cockpit (sidebar). Mede a viagem: seleção → onde o cursor tem de ir para escrever. Padrão Lovable: o prompt aparece ANCORADO ao elemento selecionado (floating bar junto à seleção). Padrão Cursor: chat na secondary sidebar (direita), adjacente ao conteúdo. VS Code 2025+: chats AI vivem por defeito na **Secondary Side Bar (direita)** — o cockpit na esquerda obriga ping-pong ocular por cima do editor de código.
- **H2 — papel de cada superfície.** Proposta a validar: prompt-de-edição = flutuante ancorado à seleção (dentro do preview); thread/histórico/estado = rail adjacente ao preview (direita); cockpit esquerda = navegação/projeto/tiers, não edição. Verifica o que o código permite hoje (webview do preview pode hospedar um floating input? CSP/concat-only permitem?).
- **H3 — preview como editor tab vs painel fixo.** Onde monta hoje (`createWebviewPanel`? `ViewColumn`?), o que acontece com 2 editores abertos, se o preview perde o foco/estado ao trocar de tab.
- Entregável: veredicto por hipótese (CONFIRMADO/REFUTADO + prova) e a disposição recomendada com custo de mudança (S/M/L).

### D-B · Botões mortos ou enganosos
Inventário COMPLETO de controlos clicáveis no cockpit + preview + chat (grep por handlers): para cada um — handler existe? faz o que o rótulo diz? estado disabled tem razão visível? Já provaste D10 ("$0" falso, openRecent não cumpre copy) — estende a varredura a TODOS os botões, chips, ícones clicáveis e menus. Regra do Paulo: **não podemos ter botões que não servem pra nada**. Cada botão morto/enganoso = finding com severidade.

### D-C · Coerência visual total (cores, emojis, ícones, animações)
- Inventário dos tokens usados (cores hardcoded vs `--vscode-*` theme vars), emojis por conceito (o tier 🐮⚡🎼🧠🌟 é usado consistentemente em TODOS os sítios? o 🛡 de security aparece igual no scan, no botão, no relatório?), spinners/animações (quantas implementações diferentes de "a trabalhar" existem?).
- Desvios = findings. Meta: um conceito → um símbolo → uma cor → uma animação, em toda a superfície.
- Verifica `prefers-reduced-motion` em todas as animações novas propostas.

### D-D · Automação zero-config (detecção de pasta/projeto)
- Traça o fluxo completo de resolução de raiz: `_wsRoot()` (fallback `process.cwd()` — trap já documentado), tri-state f19feed, tree-identity gate, `_canonRoot` (entrou? testes dual-semantics passam?).
- Port probe: a correção do sticky-port (re-probe limpa sticky quando 7819 morre) entrou? Prova com o teste.
- Cenários a validar por leitura de código: (a) janela sem pasta; (b) multi-root workspace; (c) pasta certa mas dev server de outra árvore; (d) dev server morre a meio. Em cada um: o utilizador vê o quê? A mensagem diz a causa e a ação?
- Meta do Paulo: **abrir o plugin = ele já sabe onde está, sem nenhum passo manual.**

### D-E · Fluxo E2E selecionar→prompt→editar (simulação)
- Corre os testes existentes do pipeline (`lp-*.test.js`) e reporta pass/fail real.
- Simula por leitura de código o caminho completo: click no iframe → `data-insp-path` → postMessage origin-locked → SelectionStore → prompt → tier → AST splice → diff → aplicar/reverter. Em cada elo: o que acontece se falhar? O erro chega ao utilizador com causa+ação?
- Confirma que o caminho **Perguntar** hoje termina em texto sem ação (gap #2 do Paulo) — e especifica o que falta para um "▶ Aplicar com o agente" (que função host receberia o quê).

### D-F · Registro, histórico e MEO (coerência total)
- D5 provou zero `HC.appendEvent` — verifica se entrou entretanto. Lista TODOS os eventos que deviam existir (seleção, prompt enviado, tier escolhido, edição aplicada, revert, scan, publish, override) e quais existem de facto.
- Histórico por elemento: existe persistência de prompts/edições por `data-insp-path`? Onde? Sobrevive a reload da window?
- MEO: custo por operação é registado com o label certo (nit conhecido: cost-label drift)?

### D-G · Máquina de estados visível (animações de estado)
- Mapeia a state machine real: idle → selected → prompting → routing → working → applied | failed | reverted. Para CADA estado: existe sinal visual? Onde? (outline no elemento? worktag? spinner na thread? badge?)
- Estados sem sinal visual = finding. Meta do Paulo: **nunca ficar sem saber o que está a acontecer.**

### D-H · Skills na seleção
- Ao selecionar um elemento no preview, as skills do Mooter (fix-chips, sugestões contextuais) disparam? Traça o código: o que existe, o que está ligado, o que está morto. Se skills não funcionam no modo preview, é finding P1 (requisito explícito do Paulo).

### D-I · Backend validado
- `bridgeStatus()`: caminhos `sdk-bridge-missing`/`workspace-untrusted` cobertos por teste? Cache 30s cria janela de estado errado visível?
- Origin-lock do postMessage, CSP nonce, `esc()` contract, gate do SDK por `isTrusted` (P1-A): tudo com teste? Cita os testes.
- Snapshot poll: frequência, custo, o que acontece com o dev server lento.

### D-J · Handoff entre LLMs (performance máxima)
- Tier routing 🐮 local → Haiku → Sonnet → Opus → Fable (@fable opt-in): o contexto passado a cada tier é o mínimo suficiente (Context Engine: repo-map + import-slice + data-hop)? Há re-envio redundante de contexto entre passos?
- Latência: onde estão os awaits em série que podiam ser paralelos? O utilizador vê feedback em <1s após enviar o prompt (mesmo que a edição demore)?
- Escalação: quando o 🐮 falha, o handoff para tier pago é automático, anunciado e registado no MEO?

### D-K · Preview vs Produção (URL de destino)
- Requisito novo do Paulo: o preview deve mostrar não só "isto é o preview local" mas também **para onde o Publish sobe** — a URL de produção (neste projeto: base `mooter.ai`).
- Verifica: existe hoje alguma resolução de URL de prod (vercel.json? projeto Vercel linkado? env?)? O botão Publish diz o destino antes de subir? O stepper scan→commit→push→deploy→live mostra a URL final clicável?
- Se não existe: especifica de onde a URL pode ser lida com verdade (config do repo, `vercel project ls`, env) — nunca hardcoded.

### D-L · Gap list vs Lovable/Cursor (benchmark)
Compara o que existe contra estes padrões (critérios destilados, não precisas de web):
1. Prompt ancorado à seleção com contexto do elemento visível (Lovable).
2. Um clique = um resultado; zero passos manuais intermédios (Lovable).
3. Thread viva com passos do agente, ficheiros tocados e custo (Replit Agent/Cursor).
4. Resposta de "ask" com ação de apply imediata (Cursor inline edit).
5. Erro sempre com causa provável + ação de recuperação (nunca stack trace cru).
6. Estado do sistema sempre visível num único sítio (semáforo).
7. Publish com preview do destino e gate de segurança visível no próprio botão.
Para cada padrão: TEM / PARCIAL / NÃO TEM + prova.

---

## FORMATO DO RELATÓRIO (`_handoff/LP_COHERENCE_AUDIT_REPORT.md`)
1. **Sumário executivo** (≤15 linhas): 3 problemas mais graves + veredicto da disposição (D-A).
2. **Tabela mestre**: ID · Dimensão · Finding · Severidade (P0 bloqueia cartão-de-visita / P1 grave / P2 polish / P3 nit) · Prova (ficheiro:linha) · Fix proposto (1 linha) · Esforço (S/M/L).
3. Secção por dimensão com detalhe e provas.
4. **GAP LIST final priorizada**: ordem de implementação recomendada considerando dependências (ex.: disposição D-A decide onde vive a thread D-G).
5. Rodapé: comandos executados, testes corridos com resultado real, o que ficou `n/d` e porquê.

## GATE
Quando o relatório estiver escrito: **PARA.** Não implementes nada. O Paulo cola o relatório no Cowork; o Cowork gera o mock final e o masterprompt de implementação para o Fable 5.

## NEXT (não é teu, é o plano — para contexto)
F1 esta auditoria (tu) → F2 mock final (Cowork, com os teus findings) → F3 masterprompt de implementação (Fable 5 coda em worktree, testes primeiro, commits atómicos) → F4 gate humano + prod real em mooter.ai (trigger two-factor do Paulo).

## BACK
Formato de resposta ao Paulo no fim: `⇄ CODEX→COWORK · LP-COERÊNCIA · relatório em _handoff/LP_COHERENCE_AUDIT_REPORT.md · X findings (P0: n, P1: n, P2: n, P3: n) · veredicto D-A: <uma linha>`.
