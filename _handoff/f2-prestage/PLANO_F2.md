# F2 — plano de execução idempotente

```text
prestage_base_sha: 168f598d19d7fe459191647f075cb3dd7c35d614
brief_sha256: 1ad0fe297aa35272b4c9ddabe2fe9f02dadb8846550837d7c479f837627c6c0b
maestro_v1_1_sha256: ff4ae3efe924ad0afdfbea96d38066e5eb4ab012207bf1d9211aaf21575c727b
f2_wave_status: NOT_STARTED
learner_owner_decision: PENDING
```

Este plano prepara a execução da janela que abre em `resets.seven_day` — **quinta-feira, 13/08/2026 às 22:00 na hora do dono** (`America/Sao_Paulo`, UTC-3; `2026-08-14T01:00:00Z`). **A data acima é informativa: o gate é o campo, lido no instante do dispatch, nunca esta linha.** Uma data em prosa envelhece e mente. Não executa nem fecha F2.

## Estado actual medido no pré-stage

- Branch/worktree correctos e HEAD igual ao `prestage_base_sha`.
- Só existe `_handoff/maestro-state/F0.complete.json`; `F1a.complete.json` não existe. A entrada de F2 ainda não está satisfeita.
- **`quota_predicate` CONGELADO pelo dono (2026-08-09)**, em `_handoff/maestro-state/CONFIG.json`: fonte oficial `~/.mooter/quota-live.json` (`source: cc-statusline-stdin` — o próprio Claude Code empurra os limites reais e os instantes de reset). Regra: `now >= resets.seven_day` **AND** `(now - ts) <= 30 min`. Ficheiro obsoleto ou campo ausente ⇒ `n/d` ⇒ **STOP** — nunca "assume-se que já resetou".
- `mooter_check` não foi invocado neste pré-stage; jobs vivos são `n/d`.
- `npm install` falhou tanto em `packages/cli` como em `packages/router` com `spawn EPERM`; não houve workaround e nenhum lockfile tracked mudou.
- O gate cross-device também não está pronto: `agent-sync-ledger doctor --strict` deu `LOCAL_AGENT_SYNC=fail` por device identity ausente, Node não pinado e auto-publish desligado. Não foi alterado por estar fora de âmbito.

## Contrato de retoma

O estado de tentativa vive em `_handoff/maestro-state/F2.state.jsonl`, append-only. Cada linha tem:

```json
{"phase":"F2","status":"RUNNING|BLOCKED|FAILED|COMPLETE","attempt_id":"<uuid>","step":0,"evidence":"<curta>","reason":null,"ts":"<ISO UTC>"}
```

No início, ler a última linha válida. `RUNNING` reutiliza o mesmo `attempt_id` e reconcilia Git, ledger, testes e outputs; `BLOCKED|FAILED` só cria nova tentativa após o motivo desaparecer. `COMPLETE` só é reconhecido se `_handoff/maestro-state/F2.complete.json` também existir e validar contra os seus hashes. Uma frase ou este plano nunca fecham a fase.

Função PowerShell a carregar uma vez por sessão, depois do Passo 0:

```powershell
$F2StatePath = '_handoff\maestro-state\F2.state.jsonl'
function Add-F2State([string]$Status, [int]$Step, [string]$Evidence, [string]$Reason = '') {
  $record = [ordered]@{
    phase = 'F2'; status = $Status; attempt_id = $env:F2_ATTEMPT_ID
    step = $Step; evidence = $Evidence
    reason = $(if ($Reason) { $Reason } else { $null })
    ts = [DateTime]::UtcNow.ToString('o')
  }
  ($record | ConvertTo-Json -Compress) | Add-Content -LiteralPath $F2StatePath -Encoding utf8
}
```

## Passo 0 — obrigatório no início de **toda** sessão F2

**Pré-condição verificável:** estar em `mooter/wt-f2-prestage`; `main` local já foi actualizado pelo dono/orquestrador; não haver alterações tracked sem commit. Os ficheiros de pré-stage podem continuar untracked, desde que o rebase não colida com eles.

**Comandos exactos:**

```powershell
git branch --show-current
git diff --quiet
if ($LASTEXITCODE -ne 0) { throw 'STOP: alterações tracked antes do rebase' }
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'STOP: index não está vazio antes do rebase' }
git rebase main

Push-Location packages\cli
npm install
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'BLOCKED: npm install packages/cli falhou' }
Pop-Location
Push-Location packages\router
npm install
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'BLOCKED: npm install packages/router falhou' }
Pop-Location

node --test --test-isolation=none packages/mooter-bridge/f2-prestage.test.js
```

**Critério de verde do passo:** o rebase termina sem conflito; as duas instalações terminam `0`; a bateria continua exactamente com 4 vermelhos funcionais e 2 verdes informativos. Aqui “verde” significa **baseline vermelho ainda válido**, não suite verde.

**Se falhar:** conflito de rebase ⇒ `git rebase --abort`, registar `BLOCKED`, não resolver por adivinhação. Instalação ⇒ `BLOCKED`, declarar o erro, não apagar `node_modules`, não elevar permissões. Se qualquer vermelho ficou verde, mudou a base: **PARAR e reavaliar**. Se falhar por `ImportError`, `undefined`, typo, ficheiro ausente ou `spawn EPERM`, o vermelho é inválido: corrigir o harness antes de tocar na implementação.

**Retoma:** a sessão seguinte repete este Passo 0 mesmo que exista `RUNNING`; só depois lê o último checkpoint do `attempt_id`.

## Passo 1 — gate de entrada e abertura da tentativa

**Pré-condição verificável:** Passo 0 concluído; learner ainda pode estar pendente, mas nenhuma implementação começou.

**Comandos exactos:**

```powershell
Get-FileHash -Algorithm SHA256 _handoff\SUPERMASTER_VANTAGEM_2026-08-07_v1.1.md
Get-FileHash -Algorithm SHA256 _handoff\MAESTRO_POKEMOO_2026-08-08.md
Get-FileHash -Algorithm SHA256 tools\router\classify.js
Test-Path _handoff\maestro-state\F1a.complete.json
```

E, pela ferramenta do Mooter, exactamente: `mooter_check({})`.

Confirmar ainda a fonte identificada de quota, reset, restante e reserva mínima decidida pelo dono. A medição local do `mooter_check` não substitui essa fonte.

Se não houver `RUNNING` reconciliável:

```powershell
$env:F2_ATTEMPT_ID = [guid]::NewGuid().ToString()
Add-F2State RUNNING 1 "entrada validada; base_sha=$(git rev-parse HEAD)"
```

**Critério de verde:** hashes pinados iguais; sha de `classify.js` igual a `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`; F1a `COMPLETE`; zero jobs vivos; quota satisfeita por fonte identificada; `attempt_id` persistido.

**Se falhar:** manter `NOT_STARTED` se ainda não abriu tentativa; caso contrário `Add-F2State BLOCKED 1 '<evidência>' '<motivo>'`. Não implementar.

**Retoma:** a última linha de `F2.state.jsonl` identifica `attempt_id`, step e motivo; reconfrontar todas as entradas, nunca confiar no checkpoint sozinho.

## Passo 2 — decisão do dono: learner e escritor

**Pré-condição verificável:** Paulo escolheu explicitamente A (bandit Thompson) ou B (backtest + update-router), com a relação de `aprender.recomendarAgente` decidida. Ver custos/riscos em `MAPA_INTEGRACAO.md` §4.

**Comando exacto:** registar a escolha no checkpoint:

```powershell
Add-F2State RUNNING 2 'learner=<A|B>; writer=<path decidido>; aprender_policy=<report-only|substituída>'
```

**Critério de verde:** um learner muta routing e um único writer persiste a sua verdade; `preferences.json` excluído.

**Se falhar:** `Add-F2State BLOCKED 2 'learner pendente' 'decisão do dono em falta'`; parar. A recomendação do pré-stage é B, mas não é autorização.

**Retoma:** ler a decisão literal no checkpoint e na conversa do dono; não a reconstruir de memória.

## Passo 3 — proteger sideband e os três consumidores

**Pré-condição verificável:** os quatro testes de consumidor continuam no estado medido do Passo 0.

**Trabalho:** primeiro tornar vermelho qualquer teste novo; depois adicionar `escalated` a `NON_STATE_EVENTS`, preservar os seis campos em `toolStatus`, e não mexer em `fleet`/`recibo` se os testes continuarem a provar que já toleram o evento.

**Comando exacto:**

```powershell
node --test --test-isolation=none --test-name-pattern="lastStateRecord|toolStatus|fleet\.foldJobs|recibo" packages/mooter-bridge/f2-prestage.test.js
```

**Critério de verde:** 4 testes alvo passam; `lastStateRecord` e `toolStatus` continuam `done`; `fleet.foldJobs` e `recibo` não mudam o terminal.

**Se falhar:** `Add-F2State FAILED 3 '<saída literal>' 'sideband corrompe consumidor'`; não avançar para emissão.

**Retoma:** o comando acima é o checkpoint mecânico. Só marcar:

```powershell
Add-F2State RUNNING 3 '4/4 consumidores sideband verdes'
```

## Passo 4 — contrato e persistência de `escalated`

**Pré-condição verificável:** Passo 3 verde; helper ainda ausente ou os dois testes de contrato ainda vermelhos.

**Trabalho:** implementar a seam injectável `_persistPostOracleEscalation(input, {append})`; exigir `source_event_id`, `from_tier`, `reason` não vazio, `mechanical_score` e child aceite; derivar `to_tier` por `tierDoMotor(child.agent, child.model)`, nunca por `child.tier`; persistir exactamente um evento.

**Comando exacto:**

```powershell
node --test --test-isolation=none --test-name-pattern="escalation_reason|tier efectivo" packages/mooter-bridge/f2-prestage.test.js
```

**Critério de verde:** 2/2 passam, incluindo fixture onde tier pedido é T0 e o child Sonnet efectivo é T2.

**Se falhar:** `Add-F2State FAILED 4 '<saída literal>' 'contrato escalated incompleto'`; não ligar o retry.

**Retoma:** export/helper e os 2 testes verdes são a prova; `Add-F2State RUNNING 4 'evento escalated completo e tier efectivo provado'`.

## Passo 5 — ligar o retry pós-Oráculo

**Pré-condição verificável:** Passos 3–4 verdes. Antes de implementar, acrescentar testes vermelhos de integração com spawner/append injectados.

**Trabalho:** depois de `seamless.js:2358`, persistir o terminal pai, criar/transportar o ID da medição, e agendar no máximo um child no tier seguinte quando `followup_quality === 0`. `1` e `null` não escalam; T3 sem braço superior não inventa T4; child recusado mantém o pai terminal e regista falha de dispatch sem `escalated` falso. Ligar `attempt_id` ao evento.

**Comando exacto:**

```powershell
node --test --test-isolation=none packages/mooter-bridge/f2-prestage.test.js
```

**Critério de verde:** suite de pré-stage inteira verde; integração prova um child, cap de retry, source/child ligados, reason não vazio e tier efectivo.

**Se falhar:** `Add-F2State FAILED 5 '<saída literal>' 'retry pós-Oráculo não é causal/idempotente'`; preservar o pai, não lançar jobs manuais.

**Retoma:** procurar pelo `attempt_id` e `source_event_id` no ledger. Se já há `child_job_id`, nunca repetir o dispatch. `Add-F2State RUNNING 5 'retry pós-Oráculo idempotente verde'` só após essa reconciliação.

## Passo 6 — cobrir tarefas sem escrita sem fingir semântica

**Pré-condição verificável:** retry integrado; fixtures determinísticas definidas antes do código.

**Trabalho:** encaminhar pelo Oráculo tarefas `write:false` com especificação mecânica (valor exacto, comando/exit code ou check declarado). Para resumo/análise livre sem especificação, persistir `mechanical_score:null`/`n/d` e não escalar. Não adicionar juiz-LLM.

**Comando exacto:**

```powershell
node --test --test-isolation=none --test-name-pattern="write:false|sem escrita|mechanical_score" packages/mooter-bridge/f2-prestage.test.js
```

**Critério de verde:** tarefa sem escrita verificável passa/falha pelo mecânico; tarefa sem oráculo abstém; nenhuma recebe verde por ausência de prova.

**Se falhar:** `Add-F2State FAILED 6 '<saída literal>' 'gate de leitura fabricou veredicto ou ficou descoberto'`.

**Retoma:** os testes por classe são a fronteira do que está coberto; `Add-F2State RUNNING 6 'write:false verificável coberto; análise livre=n/d'`.

## Passo 7 — integrar o learner escolhido, sem segundo escritor

**Pré-condição verificável:** escolha do Passo 2 e sideband/retry verdes.

### Se B (recomendado)

Adicionar após `inject_context.js:1180` um evento final com ID e policy tier; emparelhar `quality_feedback` por ID no backtest; tornar `router-tuning.json` proposta reconstruível; manter `update-router.js` como único writer de `tuning-state.json`; remover a mutação concorrente de `aprender.recomendarAgente` ou torná-la report-only conforme decisão.

```powershell
Push-Location tools\router
npm test -- --test-isolation=none
node backtest.js --weighted-dryrun
node update-router.js --dry-run
Pop-Location
```

### Se A

Não copiar o algoritmo. Criar uma ponte única para o package ESM/TS existente; um só host escreve `bandit-state.json`; hook/bridge só consultam; `n/d` não observa reward; HIGH_RISK mantém o floor. Como `packages/validation` é package congelado, qualquer alteração interna fora do que o dono considerar explicitamente autorizado pelo Bloco C bloqueia antes da edição.

```powershell
Push-Location packages\validation
npm test
Pop-Location
```

**Critério de verde:** testes do ramo escolhido verdes; exactamente um writer; nenhum threshold em `preferences.json`; `classify.js` intocado; nenhum live A/B ou exploração não autorizada.

**Se falhar:** restaurar o caminho baseline por patch reversível, `Add-F2State FAILED 7 '<saída>' 'learner/escritor não único'`.

**Retoma:** o checkpoint nomeia ramo e writer; `Add-F2State RUNNING 7 'learner=<A|B>; writer=<path>; suites verdes'`.

## Passo 8 — bateria interna de 10 tarefas, não A/B

**Pré-condição verificável:** um runner hermético criado em `packages/mooter-bridge/f2-battery.js`, com exactamente 10 fixtures fáceis e expectativas mecânicas congeladas antes da execução. É uma bateria de aceitação de um único sistema, não comparação de braços.

**Comando exacto:**

```powershell
node packages/mooter-bridge/f2-battery.js --attempt-id $env:F2_ATTEMPT_ID --count 10
```

**Critério de verde:** 10/10 fecham em T0/T2 com gate verde; só há escalada quando o mecânico falha; ledger prova tiers efectivos e razões; o padrão “T3 100%” não ocorre. Números além destes critérios ficam `n/d` até à run.

**Se falhar:** não repetir para escolher uma amostra favorável. `Add-F2State FAILED 8 '<saída literal>' 'bateria/ledger não cumpriu DoD'`; corrigir causa e iniciar nova tentativa declarada.

**Retoma:** o runner recusa o mesmo `attempt_id` se já existirem os 10 recibos; reconcilia pelos IDs. `Add-F2State RUNNING 8 'bateria 10/10; tiers efectivos medidos no ledger'`.

## Passo 9 — suites, invariantes e commit selectivo

**Pré-condição verificável:** Passo 8 verde; working tree contém apenas ficheiros F2 esperados.

**Comandos exactos:**

```powershell
Push-Location packages\mooter-bridge
npm test -- --test-isolation=none
Pop-Location
Push-Location packages\cli
npm test
Pop-Location
Push-Location packages\router
npm test
Pop-Location
Push-Location tools\router
npm test -- --test-isolation=none
Pop-Location

(Get-FileHash -Algorithm SHA256 tools\router\classify.js).Hash.ToLowerInvariant()
git diff --check
git status --short
```

Se B foi escolhido, stagear apenas a lista B; se A, apenas a lista A. Nunca `git add -A`:

```powershell
# comum
git add -- packages/mooter-bridge/seamless.js packages/mooter-bridge/f2-prestage.test.js packages/mooter-bridge/f2-battery.js _handoff/f2-prestage/MAPA_INTEGRACAO.md _handoff/f2-prestage/PLANO_F2.md _handoff/maestro-state/F2.state.jsonl
# opção B
git add -- tools/router/inject_context.js tools/router/backtest.js tools/router/backtest.test.js tools/router/update-router.js
# opção A — usar só se foram realmente alterados e explicitamente autorizados
git add -- packages/validation/src/bandit packages/validation/tests/bandit.test.ts
git diff --cached --name-only
git commit -m "feat(router): integrate mechanical escalation cascade"
```

**Critério de verde:** suites verdes; `git diff --check` verde; sha congelado exacto; commit só com ficheiros listados; zero push/merge/deploy.

**Se falhar:** `Add-F2State FAILED 9 '<saída literal>' 'suite/invariante/commit falhou'`; não escrever `F2.complete.json`.

**Retoma:** o commit SHA, os comandos e o ledger do `attempt_id` são a prova. `Add-F2State RUNNING 9 "implementation_commit=$(git rev-parse HEAD); suites verdes"`.

## Passo 10 — fecho mecânico, escrito por último

**Pré-condição verificável:** todos os DoD abaixo medidos, commit do Passo 9 existe e não houve mudança posterior nos outputs.

Gerar `_handoff/maestro-state/F2.complete.json` com o schema do maestro (`MAESTRO...md:40-58`): phase/status/attempt, hashes pinados, input/output hashes, repo/branch/commit, comandos reais e `completed_at`. Ligar os `escalated` do ledger ao `attempt_id`, `source_event_id` e `child_job_id`. Não incluir o próprio complete file em `output_hashes`.

**Comandos exactos de validação final:**

```powershell
Get-Content _handoff\maestro-state\F2.complete.json -Raw | ConvertFrom-Json | Format-List
(Get-FileHash -Algorithm SHA256 tools\router\classify.js).Hash.ToLowerInvariant()
git status --short --branch
```

Depois, e só depois de validar o JSON:

```powershell
Add-F2State COMPLETE 10 "F2.complete.json validado; implementation_commit=$(git rev-parse HEAD)"
git add -- _handoff/maestro-state/F2.complete.json _handoff/maestro-state/F2.state.jsonl
git commit -m "chore(maestro): record F2 completion evidence"
```

**Critério de verde:** manifesto válido e posterior a todos os inputs; hashes batem; eventos ligados; segundo commit contém apenas estado de fecho. Sem push.

**Se falhar:** não alegar `COMPLETE`; `Add-F2State FAILED 10 '<evidência>' 'manifesto inválido ou stale'`.

**Retoma:** `F2.complete.json` válido é a única prova de fecho. Um commit, bateria ou BOARD isolado não fecha F2.

## DoD copiado do brief

- bateria interna, não A/B: **10 tarefas fáceis fecham em T0/T2 com gate verde e só escalam quando o mecânico falha**;
- o padrão **“T3 100%” morre medido no ledger**;
- consumidores do ledger verdes com o evento novo;
- suite verde;
- teste vermelho antes de cada fix.

## Baseline vermelho — saída literal válida do pré-stage

Comando:

```text
node --test --test-isolation=none packages/mooter-bridge/f2-prestage.test.js
```

Saída literal:

```text
✖ VERMELHO + CONTROLO — lastStateRecord ignora escalated como sideband NÃO-STATE (1.9016ms)
✖ VERMELHO + CONTROLO — toolStatus mantém done depois do evento escalated (6.3606ms)
✔ CONTROLO/CONSUMIDOR — fleet.foldJobs já sobrevive a escalated sem perder done (0.3304ms)
✔ CONTROLO/CONSUMIDOR — recibo já fecha a wave na presença de escalated (0.8279ms)
✖ VERMELHO + CONTROLO — escalation_reason (ledger reason) é persistido e não vazio (0.2882ms)
✖ VERMELHO + CONTROLO — escalada pós-Oráculo grava o tier efectivo, não o pedido (0.165ms)
ℹ tests 6
ℹ suites 0
ℹ pass 2
ℹ fail 4
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 270.8304

✖ failing tests:

test at packages\mooter-bridge\f2-prestage.test.js:123:1
✖ VERMELHO + CONTROLO — lastStateRecord ignora escalated como sideband NÃO-STATE (1.9016ms)
  AssertionError [ERR_ASSERTION]: F2 ausente: NON_STATE_EVENTS ainda não contém escalated; lastStateRecord substituiu done pelo sideband
  + actual - expected

  + 'escalated'
  - 'done'

      at TestContext.<anonymous> (C:\Users\Paulo Loureiro\frugal-f2-prestage\packages\mooter-bridge\f2-prestage.test.js:129:10)
      at Test.runInAsyncScope (node:async_hooks:228:14)
      at Test.run (node:internal/test_runner/test:1118:25)
      at Test.start (node:internal/test_runner/test:1015:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:358:17) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 'escalated',
    expected: 'done',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at packages\mooter-bridge\f2-prestage.test.js:133:1
✖ VERMELHO + CONTROLO — toolStatus mantém done depois do evento escalated (6.3606ms)
  AssertionError [ERR_ASSERTION]: F2 ausente: toolStatus tratou escalated como estado actual em vez de sideband
  + actual - expected

  + 'escalated'
  - 'done'

      at TestContext.<anonymous> (C:\Users\Paulo Loureiro\frugal-f2-prestage\packages\mooter-bridge\f2-prestage.test.js:147:10)
      at async Test.run (node:internal/test_runner/test:1125:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:787:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 'escalated',
    expected: 'done',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at packages\mooter-bridge\f2-prestage.test.js:171:1
✖ VERMELHO + CONTROLO — escalation_reason (ledger reason) é persistido e não vazio (0.2882ms)
  AssertionError [ERR_ASSERTION]: F2 ausente: não existe persistência pós-Oráculo do evento escalated com reason obrigatório

  false !== true

      at TestContext.<anonymous> (C:\Users\Paulo Loureiro\frugal-f2-prestage\packages\mooter-bridge\f2-prestage.test.js:179:10)
      at Test.runInAsyncScope (node:async_hooks:228:14)
      at Test.run (node:internal/test_runner/test:1118:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:787:18)
      at Test.postRun (node:internal/test_runner/test:1247:19)
      at Test.run (node:internal/test_runner/test:1175:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:787:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at packages\mooter-bridge\f2-prestage.test.js:187:1
✖ VERMELHO + CONTROLO — escalada pós-Oráculo grava o tier efectivo, não o pedido (0.165ms)
  AssertionError [ERR_ASSERTION]: F2 ausente: não existe persistência pós-Oráculo capaz de derivar o tier efectivo do child

  false !== true

      at TestContext.<anonymous> (C:\Users\Paulo Loureiro\frugal-f2-prestage\packages\mooter-bridge\f2-prestage.test.js:196:10)
      at Test.runInAsyncScope (node:async_hooks:228:14)
      at Test.run (node:internal/test_runner/test:1118:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:787:18)
      at Test.postRun (node:internal/test_runner/test:1247:19)
      at Test.run (node:internal/test_runner/test:1175:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:787:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }
[mooter-seamless] ETA tool-status: não consegui ler a metadata do job: ENOENT: no such file or directory, open 'C:\Users\PAULOL~1\AppData\Local\Temp\mooter-f2-prestage-gRbDrb\jobs\tool-status\meta.json'
```

A execução anterior sem `--test-isolation=none` falhou em `spawn EPERM` antes de carregar o ficheiro e foi rejeitada como vermelho pelo motivo errado.


---

## Decisão do learner — TOMADA pelo dono, 2026-08-09

**Opção B: estender `backtest.js` + `update-router.js`.** O bandit Thompson fica **FORA do hot
path**. Um learner, um escritor.

Porquê, com o que o mapa mediu: o ciclo offline já consome `quality_feedback`
(`tools/router/backtest.js:126-171`), já gera proposta (`:568-582`) e o `update-router.js` já é
**o único escritor** de `tuning-state.json` (`:65-102`), que o classifier congelado já lê
(`classify.js:29-51`) — sem lhe tocar. A opção A exigia uma ponte do runtime CommonJS zero-deps
para um package ESM/TypeScript e metia **exploração aleatória Thompson no hot path**, com um
writer sem rename/lock (`packages/synthesis/src/config.ts:32-35`).

**Consequências que este plano tem de respeitar:**

1. `router-tuning.json` é **proposta descartável e reconstruível**; `tuning-state.json` é o
   **único estado de runtime**, e só `update-router.js` lhe toca.
2. É preciso **ID estável + tier final/efectivo** nos eventos: o pairing actual por
   sessão/tempo pode atribuir feedback ao `classified` errado (`backtest.js:134-167`).
   Isto não é polimento — é a diferença entre aprender e aprender a coisa errada.
3. **`classify.js` continua intocado** (`427d8c0b…48f`). A aprendizagem entra por
   `tuning-state.json`, que ele já lê.
4. Limitação aceite e declarada: aprende por cadência e assinaturas grosseiras, e é menos
   contextual que o bandit. Foi escolha consciente — hot path determinístico vale mais.
