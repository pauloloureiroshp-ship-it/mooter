# commit-onda1.ps1 - so ASCII. Adds SELECTIVOS. Auto-validante.
$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\Paulo Loureiro\frugal'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\commit-onda1-saida.txt'
"== HEAD antes ==" | Out-File -Encoding ascii $log
(git rev-parse --short HEAD) | Out-File -Encoding ascii -Append $log

$files = @(
  'packages/mooter-bridge/board.js',
  'packages/mooter-bridge/board.test.js',
  'packages/mooter-bridge/bundle.test.js',
  'packages/mooter-bridge/fleet.test.js',
  'packages/mooter-bridge/manifest.json',
  'packages/mooter-bridge/pack-mcpb.mjs',
  'packages/mooter-bridge/seamless.js',
  'packages/mooter-bridge/seamless.test.js',
  'packages/mooter-bridge/server-apps.js',
  'packages/mooter-bridge/tools6.js',
  'packages/mooter-bridge/tools6.test.js',
  'packages/mooter-bridge/entregas-por-versao.json',
  '_handoff/progresso.js',
  'WATCH-MOOTER.bat'
)
foreach ($f in $files) { git add -- $f }

"== staged ==" | Out-File -Encoding ascii -Append $log
(git diff --cached --name-only) | Out-File -Encoding ascii -Append $log

$msg = @"
feat(bridge): onda 1 - parar a mentira (v1.23.0)

Quatro sitios onde o produto dizia uma coisa e fazia outra:

- board: custo_total_usd e cobertura_custo_pct passam a existir como
  metricas medidas com origem declarada. Antes o painel somava so o que
  tinha preco e apresentava o resultado como se fosse o total.
- seamless: a relocacao silenciosa de worktree acabou. Se o goal e
  deictico (fala de "este ficheiro") e create_worktree mudaria a pasta,
  RECUSA com o porque em vez de trabalhar na pasta errada em silencio.
- tools6/seamless: o sufixo da worktree diz qual foi pedida e qual foi
  usada, por isso a divergencia aparece no prompt.
- pack-mcpb: nenhuma versao pode ser empacotada sem entrega declarada em
  entregas-por-versao.json. O gate falha o build, nao a maquina do utilizador.

Tambem: o teste que fixava a versao em texto ('1.22.0') foi substituido
pelo invariante que interessa - semver valido + entrega declarada. Um teste
que exige manutencao a cada release deixa de dar informacao.

Extra: _handoff/progresso.js escreve uma pagina local auto-refrescante com
o job vivo, ha quanto tempo corre e a ETA derivada da mediana real desta
maquina. Responde ao achado B7 (sem ETA em lado nenhum) a custo zero de
interacoes.

Provas: 139 testes verdes (board 16, tools6 1, bundle 6, seamless 25,
fleet 39, update 22). Bundle v1.23.0 sha256
e95b7cb34ab7d476e4336d76589e648ac8bc107d263be132f01fb10b26e28297,
instalado e verificado na pasta real da extensao (manifest=1.23.0).
"@
$msg | Out-File -Encoding utf8 'C:\Users\Paulo Loureiro\frugal\_handoff\msg-onda1.txt'
git commit -F 'C:\Users\Paulo Loureiro\frugal\_handoff\msg-onda1.txt' 2>&1 | Out-File -Encoding ascii -Append $log

"== HEAD depois ==" | Out-File -Encoding ascii -Append $log
(git rev-parse --short HEAD) | Out-File -Encoding ascii -Append $log
(git show --stat --oneline HEAD) | Out-File -Encoding ascii -Append $log

"== push ==" | Out-File -Encoding ascii -Append $log
git push origin HEAD 2>&1 | Out-File -Encoding ascii -Append $log
"== estado remoto ==" | Out-File -Encoding ascii -Append $log
(git status -sb | Select-Object -First 1) | Out-File -Encoding ascii -Append $log
"FIM" | Out-File -Encoding ascii -Append $log
