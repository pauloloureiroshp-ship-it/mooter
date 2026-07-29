# commit-y4.ps1 - so ASCII. NAO engole o stderr do git. Trata lock stale.
$ErrorActionPreference = 'Continue'
Set-Location 'C:\Users\Paulo Loureiro\frugal'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\commit-y4-saida.log'
("HEAD antes: " + (git rev-parse --short HEAD)) | Out-File -Encoding ascii $log
$lock = '.git\index.lock'
if (Test-Path $lock) {
  $idade = (New-TimeSpan -Start (Get-Item $lock).LastWriteTime).TotalSeconds
  if ($idade -gt 120) { Remove-Item $lock -Force; ("lock stale de " + [int]$idade + "s removido") | Out-File -Encoding ascii -Append $log }
  else { "lock recente - ABORTADO" | Out-File -Encoding ascii -Append $log; exit 1 }
}
foreach ($f in @(
  'packages/mooter-bridge/recibo.js','packages/mooter-bridge/recibo.test.js',
  'packages/mooter-bridge/seamless.js','packages/mooter-bridge/seamless.test.js',
  'packages/mooter-bridge/tools6.js','packages/mooter-bridge/tools6.test.js',
  'packages/mooter-bridge/fleet.js','packages/mooter-bridge/fleet.test.js',
  'packages/mooter-bridge/entrega.test.js','packages/mooter-bridge/manifest.json',
  'packages/mooter-bridge/entregas-por-versao.json','packages/mooter-bridge/pack-mcpb.mjs',
  '_handoff/BRIEF_Y4_CARGO.md','_handoff/commit-y4.ps1'
)) {
  $out = git add -- $f 2>&1
  if ($LASTEXITCODE -ne 0) { ("FALHOU add " + $f + " :: " + ($out -join ' ')) | Out-File -Encoding ascii -Append $log }
}
$staged = git diff --cached --name-only
("staged: " + ($staged | Measure-Object).Count) | Out-File -Encoding ascii -Append $log
if (-not $staged) { "NADA STAGED - a parar" | Out-File -Encoding ascii -Append $log; exit 1 }
$staged | Out-File -Encoding ascii -Append $log

$msg = @"
feat(bridge): o trabalho passa a saber de que departamento e (v1.26.0)

O board ja sabia de quem era cada METRICA - `DONOS` mapeia entregas_por_dia
a MOO, taxa_falha a MTO, custo por tarefa a MFO. O que nunca soube foi de
quem era o TRABALHO. O ledger tinha wave, agente e custo; nao tinha cargo.
Sem esse campo, qualquer frase sobre "o que o MTO entregou" era inventada -
e inventar e o que este produto existe para nao fazer.

- `cargo` e agora declarado por quem dispara (MOO MTO MFO MIO MRO MCC MEO),
  validado contra a lista, e propagado a todos os eventos do job. Um cargo
  desconhecido e recusado com os validos ao lado, nunca aceite em silencio.
  SEM declaracao fica n/d com porque - NUNCA inferido do texto. Aprendemos
  isso da maneira cara esta semana: a categoria passou meses a classificar
  rodapes de regras em vez de trabalho, e so demos por isso quando fomos
  ver porque e que todas as chaves do indice diziam git_deploy.
- o historico anterior a esta onda fica n/d e NAO e reclassificado.
- recibo.js projecta, por cargo e em tres janelas (sessao/dia/semana):
  waves, ENTREGAS (waves fechadas, nao contagem de jobs), custo com
  parcialidade declarada, trabalho a \$0, os handoffs que ja gravavamos ha
  semanas e nunca mostramos, e as excepcoes do board cujo dono e aquele
  cargo. Um cargo sem trabalho aparece com zero e o porque: a ausencia de
  trabalho num departamento e informacao, nao e nada.
- o veredicto interpretativo e escrito pelo moo LOCAL, a \$0, e responde a
  uma so pergunta: que cargos e que o MEO pode ignorar hoje. Vem num campo
  proprio, rotulado como opiniao, com os numeros sempre ao lado. Se o moo
  estiver em baixo o recibo entrega na mesma e o campo fica n/d - um
  veredicto ausente nunca derruba os factos.
- `mooter_fleet view:'recibo'` e o pulso por cargo quando a wave fecha.

PORQUE E QUE ISTO NAO E CERIMONIA: seis cargos para uma pessoa so valem se
disserem o que se pode IGNORAR. Hoje ha uma excepcao aberta - trabalho_zero
_pct, dono MOO - e cinco cargos limpos. E management by exception aplicado
a atencao de quem decide, nao burocracia aplicada a quem executa.

Provas: 404 testes verdes, 0 vermelhos, nos 32 ficheiros.
Bundle v1.26.0: 37 ficheiros, gate de entrega com 76 verificacoes de
conteudo OK, sha256
965c352a87cd7dfda17de1abf7186eaad2ddeaf3caf438cd5a4779e7fbced6e0
sha256 de tools/router/classify.js verificado intacto (FROZEN).
"@
[IO.File]::WriteAllText('C:\Users\Paulo Loureiro\frugal\_handoff\msg-y4.txt', $msg, (New-Object Text.UTF8Encoding($false)))
git commit -F 'C:\Users\Paulo Loureiro\frugal\_handoff\msg-y4.txt' 2>&1 | Out-File -Encoding ascii -Append $log
("HEAD depois: " + (git log --oneline -1)) | Out-File -Encoding ascii -Append $log
$subj = git log -1 --pretty=%s
("BOM presente: " + ($subj[0] -eq [char]0xFEFF)) | Out-File -Encoding ascii -Append $log
git push origin HEAD 2>&1 | Out-File -Encoding ascii -Append $log
(git status -sb | Select-Object -First 1) | Out-File -Encoding ascii -Append $log

"== instalar a v1.26.0 ==" | Out-File -Encoding ascii -Append $log
Set-Location 'C:\Users\Paulo Loureiro\frugal\_handoff'
node instalar-nativo.js 2>&1 | Out-File -Encoding ascii -Append $log
"FIM" | Out-File -Encoding ascii -Append $log
