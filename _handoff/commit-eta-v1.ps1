# commit-eta-v1.ps1 - so ASCII. Adds SELECTIVOS. Auto-validante.
# NOTA: a mensagem e escrita com [IO.File]::WriteAllText SEM BOM.
# O 'Out-File -Encoding utf8' do PS 5.1 mete um BOM que o git leva
# literalmente para dentro do assunto do commit (ja aconteceu em cfc3f5d).
$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\Paulo Loureiro\frugal'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\commit-eta-v1-saida.txt'
"== HEAD antes ==" | Out-File -Encoding ascii $log
(git rev-parse --short HEAD) | Out-File -Encoding ascii -Append $log

$files = @(
  'packages/mooter-bridge/eta.js',
  'packages/mooter-bridge/eta.test.js',
  'packages/mooter-bridge/seamless.js',
  'packages/mooter-bridge/tools6.js',
  'packages/mooter-bridge/pack-mcpb.mjs',
  '_handoff/BRIEF_ETA_V1.md',
  '_handoff/sondar-servidor-mcp.ps1',
  '_handoff/commit-eta-v1.ps1',
  'RUN-SONDA-MCP.bat',
  'RUN-COMMIT-ONDA1.bat'
)
foreach ($f in $files) { git add -- $f }

"== staged ==" | Out-File -Encoding ascii -Append $log
(git diff --cached --name-only) | Out-File -Encoding ascii -Append $log

$msg = @"
feat(bridge): ETA v1 - a fundacao de dados de "quanto falta"

O Mooter nunca soube dizer quanto falta, e o custo disso e medivel: o
utilizador gasta interacoes com o assistente so para perguntar "acabou?".
Esta e a fundacao. Nao ha UI nenhuma aqui de proposito - uma barra sem
denominador seria decoracao em cima de um palpite.

- seamless.js: os tres agentes passam a declarar progresso. `steps_total`
  no evento `started` e um evento `step` a cada avanco. O `cc` reaproveita
  o sinal que ja tinha; o `codex` deriva-o das chamadas de ferramenta; o
  `moo` e um passo unico, o que e honesto. Onde nao ha sinal fiavel,
  `steps_total` fica `null` com o porque - nunca um total inventado.
- eta.js: indice incremental em ~/.mooter/eta-index.json com n/p50/p75/p90
  por agente x categoria x faixa de contexto. Interrupcoes
  (`cancelled-by-user`, `orphaned-by-restart`) NAO entram nos percentis,
  porque nao medem duracao de trabalho. Timeouts levantam o `max` mas nao
  contaminam a mediana - sao observacoes censuradas a direita.
  Menos de 5 observacoes numa chave devolve null com o porque.
- janela deslizante de 200 observacoes por chave: o indice existe para o
  caminho de leitura tocar num ficheiro pequeno, e guardar amostras sem
  tecto reintroduziria por outra porta o problema que ele veio resolver.
  A mediana dos 200 jobs recentes tambem descreve melhor a maquina de
  hoje do que uma mediana que inclui hardware que ja nao esta ca.

Provas: 115 testes verdes (eta 6, board 16, tools6 1, bundle 6,
seamless 25, fleet 39, update 22). Uma das provas espia o `fs` para
garantir que ler a ETA abre exactamente um ficheiro e nunca o
ledger.jsonl - o `quota.estado` sincrono ja nos custou 209 ms a varrer
o ledger e esse erro nao se repete.
sha256 de tools/router/classify.js verificado intacto (FROZEN).
"@
[IO.File]::WriteAllText('C:\Users\Paulo Loureiro\frugal\_handoff\msg-eta-v1.txt', $msg, (New-Object Text.UTF8Encoding($false)))
git commit -F 'C:\Users\Paulo Loureiro\frugal\_handoff\msg-eta-v1.txt' 2>&1 | Out-File -Encoding ascii -Append $log

"== HEAD depois ==" | Out-File -Encoding ascii -Append $log
(git log --oneline -1) | Out-File -Encoding ascii -Append $log
"== assunto tem BOM? (tem de dizer False) ==" | Out-File -Encoding ascii -Append $log
$subj = git log -1 --pretty=%s
("BOM presente: " + ($subj[0] -eq [char]0xFEFF)) | Out-File -Encoding ascii -Append $log
("assunto: " + $subj) | Out-File -Encoding ascii -Append $log

"== push ==" | Out-File -Encoding ascii -Append $log
git push origin HEAD 2>&1 | Out-File -Encoding ascii -Append $log
(git status -sb | Select-Object -First 1) | Out-File -Encoding ascii -Append $log

"== limpar janelas WATCH duplicadas (ficam 0; reabre uma se quiseres) ==" | Out-File -Encoding ascii -Append $log
$w = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match 'WATCH-MOOTER.bat' }
foreach ($p in $w) { ("a fechar PID " + $p.ProcessId) | Out-File -Encoding ascii -Append $log; Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
"FIM" | Out-File -Encoding ascii -Append $log
