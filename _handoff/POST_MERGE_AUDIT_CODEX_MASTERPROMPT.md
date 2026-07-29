# 🔍 CODEX · AUDITORIA INDEPENDENTE PÓS-MERGE — Tese v2 (#248) + Spine Fase A (#249)

> **Papel:** és o auditor INDEPENDENTE. Não construíste nada disto (foi o Claude Code) e o teu
> valor é exatamente esse: verificar sem apego, com evidência, se o que foi PROMETIDO/ACORDADO
> está mesmo correto e se aguenta pressão adversarial. O Paulo pediu explicitamente para
> encontrar tanto FALHAS quanto OPORTUNIDADES — não te limites à matriz de baixo; qualquer coisa
> que vejas fora dela e que valha a pena reportar, reporta na secção G.
>
> **"Perfeito" não é critério de veredicto.** Em nenhuma secção abaixo uses "está perfeito" ou
> "está bom" como veredicto — usa sempre evidência concreta (teste corrido, ficheiro:linha,
> comando+output). Se não houver critério objetivo para algo, di-lo explicitamente em vez de
> inventar um.
>
> **READ-ONLY ABSOLUTO sobre o produto:** zero fixes, zero commits, zero push, zero edits a
> código. NUNCA tocar em `tools/router/classify.js` nem em `.git` de árvores partilhadas.
> O teu ÚNICO output de escrita é o relatório:
> `_handoff/POST_MERGE_AUDIT_CODEX_REPORT.md` (em `C:\Users\Paulo Loureiro\frugal` — novo
> ficheiro, só ele). Esta corrida é **só relatório** — nenhum fix, nem draft PR, mesmo que
> encontres algo trivial de corrigir. Reporta, não repares.

## Pré-condição
Isto só corre depois de o Paulo ter mergeado o PR #248 (tese v2 + ADR-0001) e o PR #249
(spine Fase A) em `main`. Confirma antes de tudo:
```
git -C "C:\Users\Paulo Loureiro\frugal" fetch origin main --tags
git -C "C:\Users\Paulo Loureiro\frugal" log --oneline origin/main -20
```
Procura os dois merge commits (mensagens "Merge pull request #248..." e "...#249..."). Se
algum dos dois não estiver lá — PÁRA e reporta qual falta; não audites um merge que não
aconteceu.

## Setup (worktree limpa, descartável)
```
git -C "C:\Users\Paulo Loureiro\frugal" worktree add C:\tmp\frugal-postmerge-audit origin/main
cd C:\tmp\frugal-postmerge-audit
npm install
cd packages\vscode-extension && npm install && cd ..\..
cd packages\worktree-conductor && npm install && cd ..\..
```
Regista o SHA exato (`git rev-parse HEAD`) no topo do relatório — é o alvo desta auditoria.

## Régua de veredicto (por item)
`PASS` = evidência direta (teste corrido por TI + inspeção de código + dado real quando
aplicável) · `PARTIAL` = funciona com lacuna concreta (descreve-a) · `FAIL` = prometido/exigido
e não confere (prova) · `N/V` = não verificável por ti — diz o que o Paulo deve olhar em 30s.
NUNCA dês PASS por "o teste existe" — corre-o. NUNCA dês PASS por "o código parece certo" —
exercita-o (`node -e` com fixtures reais quando não houver teste dedicado).

---

## A. Baseline honesto (correr primeiro, é o chão de tudo)
A1. `sha256sum tools\router\classify.js` == `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`? Se não, PARA — nada
    do resto importa até isto ser resolvido.
A2. Suite completa nos 4 pacotes que a Fase A original mediu — regista pass/total reais:
    `tools/router` (`npm test`), `packages/vscode-extension` (`npm test`),
    `tools/docs-hygiene.test.js`, `tools/router/ledger-decision.test.js` targeted.
A3. `grep -rn "your llm router" --include="*.md" --include="*.tsx" --include="*.ts" .` — deve
    dar 0 fora de contexto histórico explícito (ex. citação de ADR). Qualquer hit vivo = FAIL.
A4. `grep -rln "Your LLM router. Local-first. Learns forever."` — confirma que só sobra nos 4
    sítios já conhecidos e aceites como débito futuro: `landing/page.tsx`, `layout.tsx` (×2),
    `packages/cli/src/index.ts`, `moo-help/SKILL.md`. Se encontrares um 5º sítio não catalogado,
    é achado novo — reporta.

## B. Tese v2 / régua nova — incl. alinhamento do plugin VS Code (auditoria do #248)
B1. **ADR-0001 realmente superseded, sem órfãos.** `docs/decisions/2026-06-07-mission-statement.md`
    deve ter `Status: Superseded by tese 2026-07-15 (commit 1486af4, PR #248)`. Depois:
    `git grep -l "ADR-0001"` no repo inteiro — cada hit deve fazer sentido à luz da supersessão
    (nenhum outro ficheiro deve tratar o ADR-0001 como "Accepted"/vigente).
B2. **AGENTS.md e CLAUDE.md realmente dizem a tese nova, não a antiga.** Lê os dois ficheiros
    inteiros e confirma que a linguagem "router-first / $0-first" antiga não sobrevive em
    nenhuma secção normativa (histórico/changelog tudo bem, régua ativa não). Se encontrares
    uma frase que contradiz a tese nova (motor=fosso, cabine=produto, 5 experiências
    Resume/Plan/Route/Watch/Review), é FAIL — cita ficheiro:linha.
B3. **MOOTER_ROADMAP.md coerente com a régua.** O cabeçalho já não deve dizer "a régua de toda
    a wave" apontando para a tese antiga (achado do confronto de 2026-07-13).
B4. **SYSTEM_DESIGN.md novo (362 linhas) — é preciso ou é aspiracional?** Verifica pelo menos
    5 afirmações concretas nele (paths, portas, contratos) contra o código real. Cada
    divergência é achado.
B5. **Plugin VS Code alinhado com a tese nova — não só o repo em geral.** Especificamente em
    `packages/vscode-extension/`:
    - `package.json`: `description` do marketplace, `displayName`, e strings de `contributes`
      (comandos, settings, views) — algum ainda vende a tese antiga (router/economia) em vez da
      cabine agêntica (visibilidade/gaps/magia)?
    - `README.md` do package (o que aparece na página do marketplace) — mesmo grep.
    - Qualquer string de UI renderizada (webview HTML/TS) que cite "router" como proposta de
      valor principal, sem mencionar as 5 experiências da tese nova.
    - **Reconfirma o achado de 2026-07-13:** o plugin tinha só **8 testes num único ficheiro**
      (o "1035/1035" era do `packages/cli`, não do plugin). Continua assim? Se mudou, regista o
      número real e onde.

## C. Spine Fase A (auditoria do #249, incl. o rebase de 15/07)
C1. **Os 3 nits P2 do Gate A original — realmente fechados?** Ver `.planning/handoff-spine-v2/PHASE_A_GATE.md`
    para a lista. Corre `tools/router/ledger-decision.test.js`, `packages/vscode-extension/src/handoff-accumulator.test.js`,
    `tools/docs-hygiene.test.js` e confirma que os 3 gaps de cobertura descritos lá (branch
    `error != null` sem `is_error`; asserts de `expectedCwd`/`recent`; `HANDOFF_EXACT_DUPLICATES`/
    `PENDING_DELETION_BUCKETS`) estão MESMO testados agora, não só que os ficheiros de teste
    cresceram.
C2. **`composeHandoff()` preserva os 5 campos, de verdade.** O nit 2 original dizia que só 3/5
    eram asserted (`perfect`/`sessionGit`/`ledgerEvents`) e 2 (`expectedCwd`/`recent`) só
    "fluíam no código" sem teste. Exercita tu mesmo com um fixture que force `expectedCwd` e
    `recent` a valores não-triviais e confirma que sobrevivem ao compose. Se ainda não há
    assert automatizado para os 2, é PARTIAL — não FAIL (o comportamento pode estar certo,
    só falta o teste).
C3. **A resolução do conflito em `tools/router/package.json` (rebase de 15/07) não quebrou nada
    do lado do main.** Corre TODOS os scripts do package.json (`agent-sync`, `agent-sync:simulate`,
    `test:agent-sync`, e os 4 ledger novos) individualmente — não só o `npm test` agregado — e
    confirma que nenhum foi silenciosamente sobreposto ou desativado pela união.
C4. **`host-extra.js` pós-auto-merge de 939 linhas — zero dano colateral.** O CC alegou que a
    zona do fix do spine (`Object.assign` perto da linha 3541) não sobrepôs a reescrita do
    main. Confirma tu: `git log -p --follow -- packages/vscode-extension/src/host-extra.js`
    desde `origin/main` até este commit, e verifica manualmente que nenhuma outra função do
    ficheiro perdeu comportamento do main durante o merge automático.
C5. **`gsd-statusline-latency` — fecha a dúvida de vez.** Corre esse teste TU, no teu ambiente
    limpo, ideal em repouso, n≥15 (o CC mediu 206ms vs 207ms de mediana, dentro do baseline
    170-230ms documentado no próprio teste). Se vier verde consistentemente, confirma
    definitivamente que era ambiental. Se vier vermelho no teu ambiente também, isto muda de
    "quase certo ambiental" para "precisa de mais investigação" — sinaliza como achado P1.

## D. UX/UI do plugin VS Code (heurísticas concretas, não "perfeito")
Este bloco existe porque o Paulo pediu para avaliar UX/UI — mas "perfeita" não é testável.
Usa critérios objetivos, cada um com evidência de código/teste, não opinião estética.
D1. **Heurísticas de Nielsen aplicadas às superfícies principais** (Cockpit, Mission Control,
    Live Preview): para cada uma das 10 heurísticas, inspeciona o código/copy à procura de
    violações concretas — visibilidade de estado (há loading/erro states reais ou silêncio?),
    correspondência com o mundo real (linguagem/ícones fazem sentido para o domínio?), controle
    e liberdade (undo/cancelar existe onde deveria?), consistência (mesmo padrão visual/textual
    entre views?), prevenção de erros, reconhecimento > memorização, feedback (toda ação tem
    resposta visível?). Cada violação = achado com ficheiro:linha, não avaliação genérica.
D2. **Achados de coerência já fechados (`wave/lp-coerencia`, COH-01 a COH-19) — continuam
    fechados?** Não regrediram com os merges recentes? Spot-check pelo menos 5 dos 19.
D3. **WCAG estrutural** (mesmo padrão do item B9 usado em auditorias anteriores): tokens
    `--vscode-charts-*`/`--vscode-*` com fallback nos 3 temas, foco visível (`focus-visible`),
    informação nunca só por cor (há texto/ícone redundante?), contraste programático onde
    verificável por código sem precisar de screenshot.
D4. **Promessa vs. prática** (mesmo padrão do audit MEO A1-A3): pega em 3-5 afirmações de UI
    (tooltips, labels, texto de settings) que prometem um comportamento, e confirma por
    teste/código que o comportamento realmente acontece. Reporta cada uma com veredicto.

## E. Metodologia — coerência entre o que o repo PROMETE e o que FAZ
"Metodologia perfeita" também não é critério — audita coerência documental concreta:
E1. O fluxo operacional descrito em `AGENTS.md`/`CLAUDE.md` (handoff, `SYNC.md`, gates, Ledger
    como fonte de verdade) bate com o que os artefactos reais mostram (`SYNC.md` atual,
    `.planning/handoff-spine-v2/*`, `PHASE_A_GATE.md`)? Cada divergência concreta = achado.
E2. `SYNC.md` continua dentro do orçamento que o próprio `AGENTS.md` exige (secção
    "Information architecture", ~200 linhas)? Conta as linhas reais.
E3. O Ledger é mesmo a única fonte de verdade do handoff, ou ainda há writers que a
    contornam (achado antigo: "writers bypassam reducer", "5 gates P1 abertos" no Perfect
    Handoff Spec)? Reconfirma o estado atual desses gates — quantos continuam abertos hoje.

## F. Auditoria do ratchet ("Count frugal references in live code")
O ratchet passou a verde no #249 só por o rebase ter herdado a redução de baseline que o main
já tinha feito entretanto — não por o próprio PR ter reduzido nada. Isto é são (é assim que um
ratchet contra main deve funcionar) OU é um ponto cego (um PR podia teoricamente AUMENTAR
referências "frugal" só que dentro da margem que o main já folgou, e passar sem ninguém notar)?
Localiza o script do ratchet, lê a lógica exata de comparação, e dá um veredicto: o mecanismo
é robusto a esse cenário ou não? Se não for, é uma oportunidade concreta a reportar (não
prometida por ninguém, mas vale ouro).

## G. Varredura aberta de oportunidades e riscos (sem lista fechada)
Isto é o pedido explícito do Paulo — "encontrar possíveis falhas e oportunidades", não só
confirmar o que já foi prometido. Usa a tua leitura livre do repo pós-merge para:
G1. **Estado real da keep-list F5** — verificação que o Cowork não conseguiu fazer sem rede:
    checa via `gh pr list --state all` (ou equivalente) o estado atual de #233 (quota), #229
    (eval), #225 (moo-loop), #244 (MEO) — abertos? fechados? já mergeados? Nenhum tinha branch
    local homónima no `frugal` montado pelo Cowork; podem estar noutro worktree ou já resolvidos.
G2. **Arbiter Haiku OFF no build do amigo** — decisão tomada 2026-07-15, mas EXISTE algum
    flag/config real que a implemente, ou é só uma decisão de intenção ainda não cablada em
    código? Se não houver enforcement técnico, é um gap real antes do F0.5 (teste do amigo).
G3. **MED-1 (learning forever nunca provado, #239)** — dá uma olhada rápida ao estado do #239.
    Há algo accionável e barato que feche parte do gap (ex. um A/B mínimo) ou continua
    genuinamente bloqueado por dados que não existem ainda?
G4. Qualquer coisa que te salte à vista — dívida técnica nova introduzida pelo rebase,
    inconsistência de naming, documentação que ficou desatualizada por estes 2 PRs, um teste
    que devia existir e não existe. Sê cético por defeito.

> **Fora de escopo desta corrida (de propósito):** não avalies nem proponhas nada sobre "Moos
> agentic configuráveis" — é uma ideia nova do Paulo, ainda sem spec, que fica para um brief
> próprio mais tarde. Se a mencionares, é só para dizer "encontrei X infraestrutura relacionada
> (Fleet Arm/fleet.json/fleet-orchestrator) que pode servir de base", nada além disso.

## H. Relatório — `_handoff/POST_MERGE_AUDIT_CODEX_REPORT.md` (o entregável)
Estrutura obrigatória:
1. **TL;DR executivo** (≤10 linhas): veredicto global + top-3 achados (bons ou maus) + SHA
   auditado.
2. **Tabelas A–G** (todos os itens acima × evidência × veredicto PASS/PARTIAL/FAIL/N-V).
3. **Secção G em prosa** — as oportunidades/riscos que encontraste fora da lista fechada.
4. **Top-5 recomendações priorizadas** (impacto ÷ esforço), cada uma com o ficheiro/função
   exato onde mexer e se é bloqueante para a Fase B (Ledger durável) ou não.
5. **Apêndice:** outputs brutos dos comandos (versões, contagens de teste, greps, SHAs).
Sê tão duro quanto a evidência permitir — um relatório só-elogios não vale os créditos.

## Fecho
Depois de escrever o relatório: `git worktree remove C:\tmp\frugal-postmerge-audit --force`
(a TUA worktree descartável, mais nada) e termina com um resumo de 5 linhas + path do relatório.
