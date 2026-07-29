# commit-eta-v3.ps1 - so ASCII. Adds SELECTIVOS. Mensagem sem BOM.
# Comita a ETA v3 (barra + sonda) E o SYNC gerado, depois instala a v1.24.0.
$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\Paulo Loureiro\frugal'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\commit-eta-v3-saida.txt'
"== HEAD antes ==" | Out-File -Encoding ascii $log
(git rev-parse --short HEAD) | Out-File -Encoding ascii -Append $log

$files = @(
  'packages/mooter-bridge/fleet-ui.html',
  'packages/mooter-bridge/fleet.js',
  'packages/mooter-bridge/capacidades.js',
  'packages/mooter-bridge/capacidades.test.js',
  'packages/mooter-bridge/barra.test.js',
  'packages/mooter-bridge/sync.js',
  'packages/mooter-bridge/sync.test.js',
  'packages/mooter-bridge/manifest.json',
  'packages/mooter-bridge/entregas-por-versao.json',
  'packages/mooter-bridge/pack-mcpb.mjs',
  'SYNC.md',
  '_handoff/trazer-sync.ps1',
  '_handoff/commit-eta-v3.ps1',
  'RUN-TRAZER-SYNC.bat',
  'RUN-COMMIT-ETA2.bat'
)
foreach ($f in $files) { git add -- $f }

"== staged ==" | Out-File -Encoding ascii -Append $log
(git diff --cached --name-only) | Out-File -Encoding ascii -Append $log

$msg = @"
feat(bridge): ETA v3 - a barra, e o SYNC.md deixa de ser escrito (v1.24.0)

Duas pecas que fecham o ciclo aberto hoje de manha, quando o utilizador
gastou tres interacoes so para perguntar "ja acabou?".

A BARRA (fleet-ui.html). O painel e um MCP App: faz o seu proprio polling
local e anima sem gastar uma interacao nem um token. Uma linha por job
vivo - nunca uma barra agregada da wave, porque o denominador de uma wave
e uma soma de estimativas e o erro compoe-se.

Regras que sao honestidade, nao gosto:
- a percentagem so aparece quando vem de PASSOS REAIS. Com base em
  percentil mostra-se a barra e o tempo, nunca um "87%" que fingiria um
  denominador inexistente.
- sem observacoes suficientes: barra INDETERMINADA (a listrada), que e a
  convencao universal para "nao sei quanto falta" - e nao uma barra a 0%.
- depois do p90 a barra pulsa e diz o maximo historico. Nunca cancela,
  nunca sugere cancelar.
- o pulso do E3 e independente da barra: barra a 60% com pulso morto tem
  de mostrar os dois sinais ao mesmo tempo. E o caso que nos escapou hoje.
- debaixo de cada barra, qual estimador esta a mandar. Quem le audita.

A SONDA (capacidades.js). notifications/progress passou a ser MEDIDO ao
lado das outras capacidades. Ausencia de declaracao continua a dar null
com porque, nunca false - ausencia de prova nao e prova de ausencia.
A barra nao depende disso: a spec MCP diz que os clientes nao sao
obrigados a suportar progresso, por isso construimos para o caso mau.

O SYNC.md (sync.js). Tinha seis versoes de atraso, e a causa nao era
distraccao: actualiza-lo era manual, e num sistema que se diz automatico
tudo o que e manual diverge. Agora e PROJECTADO do manifest, do
entregas-por-versao.json, do git log e do ledger. A zona humana entre
marcadores e preservada byte a byte - e a unica parte que o gerador nao
sabe recriar, e ha um teste so para isso. Modo --check serve de gate.

Tambem: a entrega da 1.24 declarava `recibo.js`, que nao existe (o Recibo
de Fecho foi congelado por WIP). Uma entrega declarada e inexistente
parte o gate do pack - corrigida para o que a versao entrega de facto.

Provas: 140 testes verdes (barra 5, capacidades 6, estimativa 7, eta 7,
sync 5, board 16, tools6 1, bundle 6, seamless 25, fleet 40, update 22).
Bundle v1.24.0: 36 ficheiros, sha256
84181678f432b57e9ad12de5f57fe807773cb9727719802e1f12056e68934215
sha256 de tools/router/classify.js verificado intacto (FROZEN).
"@
[IO.File]::WriteAllText('C:\Users\Paulo Loureiro\frugal\_handoff\msg-eta-v3.txt', $msg, (New-Object Text.UTF8Encoding($false)))
git commit -F 'C:\Users\Paulo Loureiro\frugal\_handoff\msg-eta-v3.txt' 2>&1 | Out-File -Encoding ascii -Append $log

"== HEAD depois ==" | Out-File -Encoding ascii -Append $log
(git log --oneline -1) | Out-File -Encoding ascii -Append $log
$subj = git log -1 --pretty=%s
("BOM presente: " + ($subj[0] -eq [char]0xFEFF)) | Out-File -Encoding ascii -Append $log
"== push ==" | Out-File -Encoding ascii -Append $log
git push origin HEAD 2>&1 | Out-File -Encoding ascii -Append $log
(git status -sb | Select-Object -First 1) | Out-File -Encoding ascii -Append $log

"== instalar a v1.24.0 na pasta real da extensao ==" | Out-File -Encoding ascii -Append $log
Set-Location 'C:\Users\Paulo Loureiro\frugal\_handoff'
node instalar-nativo.js 2>&1 | Out-File -Encoding ascii -Append $log
"FIM" | Out-File -Encoding ascii -Append $log
