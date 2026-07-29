# commit-x2.ps1 - so ASCII. Adds SELECTIVOS. Mensagem sem BOM.
# Fecha a W9 (por commitar) + a Onda X2 (o gate dentro do pack).
$ErrorActionPreference = 'Continue'
Set-Location 'C:\Users\Paulo Loureiro\frugal'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\commit-x2-saida.txt'
"== HEAD antes ==" | Out-File -Encoding ascii $log
(git rev-parse --short HEAD) | Out-File -Encoding ascii -Append $log

"== descartar ruido do mount (so se o diff sem espacos vier VAZIO) ==" | Out-File -Encoding ascii -Append $log
foreach ($f in @('packages/mooter-bridge/seamless.js','packages/mooter-bridge/tools6.js')) {
  $d = git diff --ignore-all-space --ignore-blank-lines -- $f
  if ($d) { ("MANTIDO (conteudo real): " + $f) | Out-File -Encoding ascii -Append $log }
  else { git checkout -- $f; ("descartado (ruido): " + $f) | Out-File -Encoding ascii -Append $log }
}

$files = @(
  'packages/mooter-bridge/entrega.test.js',
  'packages/mooter-bridge/pack-mcpb.mjs',
  'packages/mooter-bridge/sync.js',
  'packages/mooter-bridge/sync.test.js',
  'packages/mooter-bridge/package.json',
  '_handoff/commit-x2.ps1',
  '_handoff/fecho-do-dia.ps1',
  'RUN-FECHO-DIA.bat',
  'RUN-COMMIT-ETA3.bat'
)
foreach ($f in $files) { git add -- $f }

"== staged ==" | Out-File -Encoding ascii -Append $log
(git diff --cached --name-only) | Out-File -Encoding ascii -Append $log

$msg = @"
feat(bridge): o gate de entrega sai da disciplina e entra no caminho

Ate aqui, `verifyDeliveries` provava que os ficheiros declarados EXISTEM.
Um `existsSync` passa com um ficheiro vazio: era possivel empacotar uma
versao cuja entrega tinha sido regredida e o bundle saia com carimbo de
aprovado. O `entrega.test.js` verificava conteudo, mas so valia se alguem
se lembrasse de o correr.

- pack-mcpb.mjs corre agora o entrega.test.js e RECUSA-SE a escrever o
  .mcpb se ele falhar. Provado com teste negativo: renomeei `eta-track`
  no fleet-ui.html, o gate travou e o ficheiro NAO foi escrito.
  So este teste, de proposito - a bateria inteira transformaria o pack
  num CI e as pessoas contornavam-no com uma variavel de ambiente.
- entrega.test.js passa a cobrir TODAS as versoes declaradas, nao so a
  actual. Verificar so a corrente deixava as anteriores sem guarda: uma
  regressao que apagasse o custo_total_usd do board (entregue na 1.23)
  passava despercebida enquanto a versao corrente fosse outra. As
  entregas passadas sao promessas que continuam de pe.
  Marcadores acrescentados para sentinela, afericao, board, seamless,
  tools6 e server-apps - lidos do codigo real, nao inventados.
- sync.test.js ganha a prova do acoplamento render<->semHead. A mascara
  e uma regex que procura literalmente "^- HEAD: ". Se alguem renomear a
  etiqueta no renderSync, a mascara fica orfa e o --check volta em
  silencio ao paradoxo auto-referencial, a sair 1 para sempre. O teste
  exige que o render emita exactamente uma linha na forma que a mascara
  reconhece - parte alto em vez de degradar calado.
- sync.js documenta que o --check so estabiliza com a frota parada: o
  SYNC.md inclui estado lido ao vivo do ledger.
- package.json expoe `npm run sync:check`.

Provas: bateria COMPLETA dos 30 ficheiros de teste - 348 verdes, 0
vermelhos. (Registo de honestidade: a sessao anterior anunciou "140
testes verdes" tendo corrido 11 dos 29 ficheiros existentes. O numero
estava certo para o que correu e errado como afirmacao sobre a bateria.)
sha256 de tools/router/classify.js verificado intacto (FROZEN).
"@
[IO.File]::WriteAllText('C:\Users\Paulo Loureiro\frugal\_handoff\msg-x2.txt', $msg, (New-Object Text.UTF8Encoding($false)))
git commit -F 'C:\Users\Paulo Loureiro\frugal\_handoff\msg-x2.txt' 2>&1 | Out-File -Encoding ascii -Append $log

"== HEAD depois ==" | Out-File -Encoding ascii -Append $log
(git log --oneline -1) | Out-File -Encoding ascii -Append $log
$subj = git log -1 --pretty=%s
("BOM presente: " + ($subj[0] -eq [char]0xFEFF)) | Out-File -Encoding ascii -Append $log
"== push ==" | Out-File -Encoding ascii -Append $log
git push origin HEAD 2>&1 | Out-File -Encoding ascii -Append $log
(git status -sb | Select-Object -First 1) | Out-File -Encoding ascii -Append $log

"== GPU: quem esta residente ==" | Out-File -Encoding ascii -Append $log
try {
  $ps = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/ps' -TimeoutSec 5
  foreach ($m in $ps.models) { ($m.model + "  " + [math]::Round($m.size_vram/1GB,1) + " GB  expira " + $m.expires_at) | Out-File -Encoding ascii -Append $log }
  if (-not $ps.models) { "nenhum modelo residente" | Out-File -Encoding ascii -Append $log }
} catch { ("nao consegui ler /api/ps: " + $_.Exception.Message) | Out-File -Encoding ascii -Append $log }
(nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader) | Out-File -Encoding ascii -Append $log
"FIM" | Out-File -Encoding ascii -Append $log
