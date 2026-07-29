# commit-y1.ps1 - so ASCII. NAO engole o stderr do git. Trata lock stale.
$ErrorActionPreference = 'Continue'
Set-Location 'C:\Users\Paulo Loureiro\frugal'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\commit-y1-saida.log'
("HEAD antes: " + (git rev-parse --short HEAD)) | Out-File -Encoding ascii $log
$lock = '.git\index.lock'
if (Test-Path $lock) {
  $idade = (New-TimeSpan -Start (Get-Item $lock).LastWriteTime).TotalSeconds
  if ($idade -gt 120) { Remove-Item $lock -Force; ("lock stale de " + [int]$idade + "s removido") | Out-File -Encoding ascii -Append $log }
  else { "lock recente - ABORTADO" | Out-File -Encoding ascii -Append $log; exit 1 }
}

$ficheiros = @(
  'packages/mooter-bridge/aprender.js','packages/mooter-bridge/aprender.test.js',
  'packages/mooter-bridge/eta.js','packages/mooter-bridge/eta.test.js',
  'packages/mooter-bridge/seamless.js','packages/mooter-bridge/seamless.test.js',
  'packages/mooter-bridge/fleet.js','packages/mooter-bridge/fleet.test.js',
  'packages/mooter-bridge/board.js','packages/mooter-bridge/board.test.js',
  'packages/mooter-bridge/v12.test.js','packages/mooter-bridge/tools6.js',
  '_handoff/BRIEF_Y1_CATEGORIA.md','_handoff/medir-eta-index.ps1','_handoff/commit-y1.ps1'
)
foreach ($f in $ficheiros) {
  $out = git add -- $f 2>&1
  if ($LASTEXITCODE -ne 0) { ("FALHOU add " + $f + " :: " + ($out -join ' ')) | Out-File -Encoding ascii -Append $log }
}
$staged = git diff --cached --name-only
("staged: " + ($staged | Measure-Object).Count) | Out-File -Encoding ascii -Append $log
if (-not $staged) { "NADA STAGED - a parar" | Out-File -Encoding ascii -Append $log; exit 1 }
$staged | Out-File -Encoding ascii -Append $log

$msg = @"
fix(bridge): a telemetria estava a classificar as regras, nao o trabalho

MEDIDO no eta-index.json real: quase todas as chaves eram git_deploy.
  moo|git_deploy|<4k n=7 · cc|git_deploy|<4k n=10 · cc|git_deploy|4-32k n=6
Um job de "implementa o tecto de VRAM" e um de "commita isto" caiam na
mesma chave, e a mediana misturava os dois.

A CAUSA. `git_deploy` e o primeiro padrao da lista e apanha
\b(git|commit|push|merge)\b. Todos os briefs desta casa terminam com
"git add selectivo, sem push". A instrucao que existe para proteger o
repo era a que envenenava a telemetria.

A CONSEQUENCIA, pior. `recomendarAgente` devolvia null para git_deploy.
Como tudo era git_deploy, o loop de auto-aprendizagem NUNCA disparou uma
unica vez em producao - e ninguem deu por isso, porque devolvia null
educadamente. Construimos o self-learning, testamo-lo, demos-lhe verde,
e ele nunca recomendou nada a ninguem.

- o classificador le o OBJECTIVO e ignora o rodape de regras. Provado
  nos dois sentidos: objectivo de codigo + rodape de git => `codigo`;
  objectivo genuinamente de git => continua `git_deploy`. Nao trocamos um
  falso positivo por um falso negativo.
- `category` explicita como override, com `category_fonte` (declarada vs
  inferida) gravada. Quem le a metrica tem de saber se foi adivinhada.
- o historico NAO e reclassificado. Reescrever o passado com regras novas
  e a fabricacao que este produto existe para evitar.
- `recomendarAgente` devolve sempre { agente, porque }: um veto deixa de
  ser indistinguivel de "ainda nao tenho dados".
- as recusas do `observeTerminal` deixam de ser silenciosas e entram no
  ledger como `eta_observacao_recusada` com o porque. Era o buraco que
  fazia o codex ter 10% de captura (2 observacoes para 21 done) sem
  ninguem saber. A taxa de captura por agente passa a ser visivel.

E O BUG QUE A BATERIA APANHOU, introduzido por esta propria onda:
`eta_observacao_recusada` e escrito DEPOIS do `failed` de um cancel, e o
`toolCancel` decidia idempotencia por TERMINAL.has(ultimo_evento). Bastou
um evento de diagnostico a seguir ao desfecho para o job parecer vivo
outra vez e o cancel deixar de ser idempotente. Ja existia a lista
NON_STATE_EVENTS para isto (cross_check, step) e a onda esqueceu-se de la
por o evento novo. Um diagnostico NUNCA e um estado. Corrigido nos dois
sitios, com regressao em v12.test.js.

Provas: 376 testes verdes, 0 vermelhos, nos 31 ficheiros.
sha256 de tools/router/classify.js verificado intacto (FROZEN).
"@
[IO.File]::WriteAllText('C:\Users\Paulo Loureiro\frugal\_handoff\msg-y1.txt', $msg, (New-Object Text.UTF8Encoding($false)))
git commit -F 'C:\Users\Paulo Loureiro\frugal\_handoff\msg-y1.txt' 2>&1 | Out-File -Encoding ascii -Append $log
("HEAD depois: " + (git log --oneline -1)) | Out-File -Encoding ascii -Append $log
$subj = git log -1 --pretty=%s
("BOM presente: " + ($subj[0] -eq [char]0xFEFF)) | Out-File -Encoding ascii -Append $log
git push origin HEAD 2>&1 | Out-File -Encoding ascii -Append $log
(git status -sb | Select-Object -First 1) | Out-File -Encoding ascii -Append $log
"FIM" | Out-File -Encoding ascii -Append $log
