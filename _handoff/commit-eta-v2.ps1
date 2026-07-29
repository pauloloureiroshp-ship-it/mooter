# commit-eta-v2.ps1 - so ASCII. Adds SELECTIVOS. Mensagem sem BOM.
$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\Paulo Loureiro\frugal'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\commit-eta-v2-saida.txt'
"== HEAD antes ==" | Out-File -Encoding ascii $log
(git rev-parse --short HEAD) | Out-File -Encoding ascii -Append $log

$files = @(
  'packages/mooter-bridge/estimativa.js',
  'packages/mooter-bridge/estimativa.test.js',
  'packages/mooter-bridge/eta.js',
  'packages/mooter-bridge/eta.test.js',
  'packages/mooter-bridge/fleet.js',
  'packages/mooter-bridge/fleet.test.js',
  'packages/mooter-bridge/seamless.js',
  'packages/mooter-bridge/seamless.test.js',
  'packages/mooter-bridge/tools6.js',
  'packages/mooter-bridge/pack-mcpb.mjs',
  '_handoff/BRIEF_ETA_V2.md',
  '_handoff/BRIEF_ETA_V3.md',
  '_handoff/BRIEF_SYNC_GERADO.md',
  '_handoff/commit-eta-v2.ps1',
  '_handoff/limpar-e-commitar-claudemd.ps1',
  'RUN-LIMPAR.bat',
  'RUN-COMMIT-ETA1.bat'
)
foreach ($f in $files) { git add -- $f }

"== staged ==" | Out-File -Encoding ascii -Append $log
(git diff --cached --name-only) | Out-File -Encoding ascii -Append $log

$msg = @"
feat(bridge): ETA v2 - onde vai, quanto falta, e se esta vivo

Tres perguntas diferentes, tres sinais separados. A versao anterior deste
plano tinha tres estimadores de TEMPO, e estava errada: bytes de log nao
medem trabalho. Um job que le 50 ficheiros gera log a rodos e entrega
pouco; um que pensa muito gera pouco log e entrega muito. Como estimador
de duracao, o crescimento do log e ruido com ar de sinal.

Mas e o unico que responde a pergunta que os outros dois nao respondem.
Entao cada um ficou com o seu papel:

  E1 passos declarados -> ONDE VAI     (3 de 4)
  E2 percentil historico -> QUANTO FALTA (~7 min)
  E3 crescimento do out.log -> ESTA VIVO  (cresceu ha 4 s / parado ha 6 min)

E a anatomia de um download: percentagem E velocidade actual. Quando a
velocidade e zero ve-se logo, mesmo com a barra a 60%. E exactamente o
caso que nos escapou hoje - um job ficou 30 min e saiu `timeout` com o
trabalho todo feito, e ninguem soube distinguir "a trabalhar" de "preso".

- estimativa.js: devolve progresso, falta_s, vivo, manda e aviso. O
  falta_s sai SEMPRE do estimador mais conservador de entre os que tem
  base medida - nunca a media, que inventaria um numero que nenhum dos
  dois defendeu. O campo `manda` e obrigatorio: quem le tem de poder
  auditar de onde veio o numero.
- a ETA nunca encolhe abaixo do tempo ja decorrido. Uma barra que salta
  para tras destroi mais confianca do que barra nenhuma.
- passar o p90 gera aviso com o maximo historico, e mais nada. Nunca
  cancela, nunca sugere cancelar.
- eta.js guarda bytes_finais na mesma amostra e na mesma janela de 200.
  Os percentis de bytes normalizam SO a vivacidade e estao marcados no
  codigo como fora do calculo de tempo, para que ninguem os ligue a ETA
  daqui a tres meses.
- ligado ao mooter_check e ao mooter_fleet: uma linha por job vivo,
  nunca uma barra agregada da wave, porque o denominador de uma wave e
  uma soma de estimativas e o erro compoe-se.

Provas: 124 testes verdes (estimativa 7, eta 7, board 16, tools6 1,
bundle 6, seamless 25, fleet 40, update 22). Uma das provas garante que
duplicar os bytes de uma amostra nao muda a estimativa de tempo em caso
nenhum; outra que um ciclo de leitura nao abre o ledger.jsonl.
sha256 de tools/router/classify.js verificado intacto (FROZEN).
"@
[IO.File]::WriteAllText('C:\Users\Paulo Loureiro\frugal\_handoff\msg-eta-v2.txt', $msg, (New-Object Text.UTF8Encoding($false)))
git commit -F 'C:\Users\Paulo Loureiro\frugal\_handoff\msg-eta-v2.txt' 2>&1 | Out-File -Encoding ascii -Append $log

"== HEAD depois ==" | Out-File -Encoding ascii -Append $log
(git log --oneline -1) | Out-File -Encoding ascii -Append $log
$subj = git log -1 --pretty=%s
("BOM presente: " + ($subj[0] -eq [char]0xFEFF)) | Out-File -Encoding ascii -Append $log
"== push ==" | Out-File -Encoding ascii -Append $log
git push origin HEAD 2>&1 | Out-File -Encoding ascii -Append $log
(git status -sb | Select-Object -First 1) | Out-File -Encoding ascii -Append $log
"FIM" | Out-File -Encoding ascii -Append $log
