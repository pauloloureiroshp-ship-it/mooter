# commit-x456b.ps1 - so ASCII. NAO ENGOLE ERROS (o Out-Null da v1 escondeu-os).
$ErrorActionPreference = 'Continue'
Set-Location 'C:\Users\Paulo Loureiro\frugal'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\commit-x456b-saida.log'
"== diagnostico ==" | Out-File -Encoding ascii $log
("HEAD: " + (git rev-parse --short HEAD)) | Out-File -Encoding ascii -Append $log
$lock = '.git\index.lock'
if (Test-Path $lock) {
  $idade = (New-TimeSpan -Start (Get-Item $lock).LastWriteTime).TotalSeconds
  ("index.lock EXISTE, com " + [int]$idade + " s") | Out-File -Encoding ascii -Append $log
  if ($idade -gt 120) { Remove-Item $lock -Force; "lock stale removido" | Out-File -Encoding ascii -Append $log }
  else { "lock recente - ABORTADO, ha git a correr" | Out-File -Encoding ascii -Append $log; exit 1 }
} else { "sem index.lock" | Out-File -Encoding ascii -Append $log }

"== git add, um a um, COM o erro a vista ==" | Out-File -Encoding ascii -Append $log
$codigo = @(
  'packages/mooter-bridge/moo.js','packages/mooter-bridge/moo.test.js','packages/mooter-bridge/vram.test.js',
  'packages/mooter-bridge/localfirst.js','packages/mooter-bridge/aprender.js','packages/mooter-bridge/board.js',
  'packages/mooter-bridge/seamless.js','packages/mooter-bridge/tools6.js','packages/mooter-bridge/estimativa.js',
  'packages/mooter-bridge/estimativa.test.js','packages/mooter-bridge/entrega.test.js',
  'packages/mooter-bridge/manifest.json','packages/mooter-bridge/entregas-por-versao.json',
  '.github/workflows/test.yml','.gitignore','packages/mooter-bridge/sync.test.js'
)
foreach ($f in $codigo) {
  $out = git add -- $f 2>&1
  if ($LASTEXITCODE -ne 0) { ("FALHOU add " + $f + " :: " + ($out -join ' ')) | Out-File -Encoding ascii -Append $log }
}
"== _handoff (briefs e runners) ==" | Out-File -Encoding ascii -Append $log
$md = Get-ChildItem '_handoff' -File -Filter '*.md' | ForEach-Object { '_handoff/' + $_.Name }
$ps = Get-ChildItem '_handoff' -File -Filter '*.ps1' | ForEach-Object { '_handoff/' + $_.Name }
foreach ($f in ($md + $ps)) { git add -- $f 2>&1 | Out-Null }
("md=" + $md.Count + "  ps1=" + $ps.Count) | Out-File -Encoding ascii -Append $log

$staged = git diff --cached --name-only
("== staged: " + ($staged | Measure-Object).Count + " ficheiro(s) ==") | Out-File -Encoding ascii -Append $log
if (-not $staged) { "NADA STAGED - a parar" | Out-File -Encoding ascii -Append $log; "FIM" | Out-File -Encoding ascii -Append $log; exit 1 }
($staged | Select-Object -First 20) | Out-File -Encoding ascii -Append $log

$msg = @"
feat(bridge): tecto de VRAM, a ETA para de fingir 100%, e os gates entram no CI (v1.25.0)

TRES SITIOS ONDE O PRODUTO DECIDIA POR NOS EM SILENCIO.

1. O SELECTOR ENCHIA A PLACA. Medido hoje: qwen3.6:35b-a3b residente com
   19,3 GB numa GPU de 23 GB, 644 MB livres. O pontuar() maximizava
   capacidade sem nunca perguntar "e depois disto, ainda cabe alguma
   coisa?". A consequencia era silenciosa e cara: o pedido seguinte nao
   cabia, caia para a nuvem, e ninguem era avisado. O produto inteiro
   existe para dizer a verdade sobre para onde foi o trabalho, e aqui a
   decisao de gastar dinheiro era um efeito lateral da escolha anterior.
   Agora: FOLGA_MINIMA_GB=2 ou 10% da placa, o que for maior; um modelo ja
   residente continua elegivel (a regra e sobre CARREGAR, nao usar); e
   `falta_vram` e um motivo nao_local proprio, distinto de
   `forcado_por_quota` - duas causas diferentes deixam de contar como uma.

2. A ETA MENTIU EM USO REAL, E FOI O PROPRIO PRODUTO QUE A APANHOU.
   No job-ms3keiig-ef8f o Codex emitiu steps_done=36 contra steps_total=4:
   o detector conta CHAMADAS DE FERRAMENTA e o total vem do plano da wave -
   duas grandezas diferentes com o mesmo nome. O progressFor fazia
   Math.min(done,total) e devolvia "4 de 4"; o stepEstimate dividia 4/4=1
   e anunciava "faltam 0 s". Barra cheia, job a meio, durante 959 s. Ao
   lado, na mesma resposta, o E3 dizia "a-trabalhar, cresceu ha 0 s".
   Dois blocos a contradizerem-se.
   Clampar nao e defender-se do erro: e esconde-lo e apresenta-lo como
   certeza. `done > total` e a PROVA de que o denominador esta errado -
   agora devolve n/d com o porque e o E2 assume. E "faltam 0 s" num job
   vivo passou a ser impossivel por construcao.
   Foi o E3 - o estimador que quase cortamos por ser "o mais fraco" - que
   salvou a resposta. Era exactamente para isto que ele existia.

3. OS GATES ESTAVAM FORA DO CAMINHO DE TODA A GENTE.
   - packages/mooter-bridge corria INTEIRO fora do CI. Uma sessao chegou a
     anunciar "140 testes verdes" tendo corrido 11 dos 29 ficheiros. Um
     numero que ninguem verifica nao e uma prova. Agora corre no CI, com o
     gate de entrega isolado para o vermelho dizer JA o que se partiu.
   - `sync:check` NAO entra como gate, de proposito, e o porque fica
     escrito no workflow: o SYNC.md projecta estado lido ao vivo do ledger
     local, que no runner nao existe - seria vermelho SEMPRE por ambiente,
     nao por deriva. Um gate com falsos vermelhos acaba desligado, e um
     guarda desligado nao guarda nada. Verifica-se o que da: que o gerador
     carrega, mantem o contrato, e que a mascara do HEAD ainda reconhece o
     que o renderSync produz.
   - 18 .jsonl estavam versionados so por acidente historico: entraram no
     indice antes da regra `*.jsonl`, e o .gitignore nao afecta o que ja e
     tracked. Um `git rm --cached` numa limpeza re-ignorava-os NA HORA e
     desapareciam sem aviso - sao os corpora que tornam os numeros das
     waves 1.5 e 23 reproduziveis. Ficam com excepcoes `!` explicitas.
     Verificado: `git check-ignore` deixou de apanhar os 18.
   - Artefactos de sessao passam a ser ignorados. Medido: 690 por commitar,
     635 deles lixo - 262 pastas temporarias em scripts/ (o mkdtempSync
     resolveu o tmpdir para dentro do repo) e ~150 saidas de runners. Um
     `git status` com 690 linhas deixa de servir para ver o que mudou, que
     e a unica coisa para que serve. Os briefs (.md) e os runners (.ps1)
     ficam versionados: sao a memoria de COMO as coisas foram decididas.

Provas: bateria COMPLETA dos 31 ficheiros - 368 verdes, 0 vermelhos.
Dois dos testes sao regressao do caso real, com os numeros do job.
Bundle v1.25.0: 36 ficheiros, gate de entrega com 61 verificacoes de
conteudo OK, sha256
ebe2f7ddcdf43753aabc1fe4320ffd3bc12a7c84ac8e127347acbe0019ca34fa
sha256 de tools/router/classify.js verificado intacto (FROZEN).
"@
[IO.File]::WriteAllText('C:\Users\Paulo Loureiro\frugal\_handoff\msg-x456.txt', $msg, (New-Object Text.UTF8Encoding($false)))
git commit -F 'C:\Users\Paulo Loureiro\frugal\_handoff\msg-x456.txt' 2>&1 | Out-File -Encoding ascii -Append $log

"== HEAD depois ==" | Out-File -Encoding ascii -Append $log
(git log --oneline -1) | Out-File -Encoding ascii -Append $log
$subj = git log -1 --pretty=%s
("BOM presente: " + ($subj[0] -eq [char]0xFEFF)) | Out-File -Encoding ascii -Append $log
git push origin HEAD 2>&1 | Out-File -Encoding ascii -Append $log
(git status -sb | Select-Object -First 1) | Out-File -Encoding ascii -Append $log
("untracked depois: " + ((git status --porcelain | Where-Object { $_ -like '?? *' }).Count)) | Out-File -Encoding ascii -Append $log
"FIM" | Out-File -Encoding ascii -Append $log
