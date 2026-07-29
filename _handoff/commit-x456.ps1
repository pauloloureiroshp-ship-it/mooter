# commit-x456.ps1 - so ASCII. Adds SELECTIVOS. Mensagem sem BOM.
# Tres commits: codigo (X4+X6), gates (X5+CI+gitignore), memoria (_handoff).
# Depois empacota e instala a v1.25.0.
$ErrorActionPreference = 'Continue'
Set-Location 'C:\Users\Paulo Loureiro\frugal'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\commit-x456-saida.log'
"== HEAD antes ==" | Out-File -Encoding ascii $log
(git rev-parse --short HEAD) | Out-File -Encoding ascii -Append $log

function Commit([string[]]$ficheiros, [string]$mensagem, [string]$nome) {
  foreach ($f in $ficheiros) { git add -- $f 2>&1 | Out-Null }
  $staged = git diff --cached --name-only
  if (-not $staged) { ("SEM NADA PARA " + $nome) | Out-File -Encoding ascii -Append $log; return }
  ("== staged para " + $nome + ": " + ($staged | Measure-Object).Count + " ficheiro(s) ==") | Out-File -Encoding ascii -Append $log
  $tmp = 'C:\Users\Paulo Loureiro\frugal\_handoff\msg-tmp.txt'
  [IO.File]::WriteAllText($tmp, $mensagem, (New-Object Text.UTF8Encoding($false)))
  git commit -F $tmp 2>&1 | Out-File -Encoding ascii -Append $log
  (git log --oneline -1) | Out-File -Encoding ascii -Append $log
}

# --- 1. codigo: o tecto de VRAM e a ETA que deixou de fingir --------------
Commit @(
  'packages/mooter-bridge/moo.js',
  'packages/mooter-bridge/moo.test.js',
  'packages/mooter-bridge/vram.test.js',
  'packages/mooter-bridge/localfirst.js',
  'packages/mooter-bridge/aprender.js',
  'packages/mooter-bridge/board.js',
  'packages/mooter-bridge/seamless.js',
  'packages/mooter-bridge/tools6.js',
  'packages/mooter-bridge/estimativa.js',
  'packages/mooter-bridge/estimativa.test.js',
  'packages/mooter-bridge/entrega.test.js',
  'packages/mooter-bridge/manifest.json',
  'packages/mooter-bridge/entregas-por-versao.json'
) @"
feat(bridge): tecto de VRAM no selector, e a ETA para de fingir 100% (v1.25.0)

DOIS SITIOS ONDE O PRODUTO DECIDIA POR NOS EM SILENCIO.

1. O selector enchia a placa. Medido hoje: qwen3.6:35b-a3b residente com
   19,3 GB numa GPU de 23 GB, 644 MB livres. O pontuar() maximizava
   capacidade sem nunca perguntar "e depois disto, ainda cabe alguma
   coisa?". Consequencia silenciosa e cara: o pedido seguinte nao cabia,
   caia para a nuvem, e ninguem era avisado - o produto inteiro existe
   para dizer a verdade sobre para onde foi o trabalho, e aqui a decisao
   de gastar dinheiro era um efeito lateral da escolha anterior.
   Agora: FOLGA_MINIMA_GB=2 ou 10% da placa, o que for maior. Um modelo
   ja residente continua elegivel (a regra e sobre CARREGAR, nao usar).
   E `falta_vram` e um motivo nao_local proprio, distinto de
   `forcado_por_quota` - duas causas diferentes deixam de contar como uma.

2. A ETA mentiu em uso real, e foi o proprio produto que a apanhou.
   No job-ms3keiig-ef8f o Codex emitiu steps_done=36 contra steps_total=4:
   o detector conta CHAMADAS DE FERRAMENTA e o total vem do plano da wave -
   duas grandezas diferentes com o mesmo nome. O progressFor fazia
   Math.min(done,total) e devolvia "4 de 4"; o stepEstimate dividia 4/4=1
   e anunciava "faltam 0 s". Barra cheia, job a meio, durante 959 segundos.
   Ao lado, na mesma resposta, o E3 dizia "a-trabalhar, cresceu ha 0 s".
   Dois blocos a contradizerem-se.
   Clampar nao e defender-se do erro: e esconde-lo e apresenta-lo como
   certeza. `done > total` e a PROVA de que o denominador esta errado -
   agora devolve n/d com o porque e o E2 assume. E "faltam 0 s" num job
   vivo passou a ser impossivel por construcao, nao uma estimativa
   optimista.
   Foi o E3 - o estimador que quase cortamos por ser "o mais fraco" - que
   salvou a resposta. Era exactamente para isto que ele existia.

Provas: bateria COMPLETA dos 31 ficheiros - 368 verdes, 0 vermelhos.
Dois testes sao regressao do caso real, com os numeros do job.
Bundle v1.25.0: 36 ficheiros, gate de entrega com 61 verificacoes de
conteudo OK, sha256
ebe2f7ddcdf43753aabc1fe4320ffd3bc12a7c84ac8e127347acbe0019ca34fa
sha256 de tools/router/classify.js verificado intacto (FROZEN).
"@ 'codigo'

# --- 2. gates: CI + gitignore --------------------------------------------
Commit @(
  '.github/workflows/test.yml',
  '.gitignore',
  'packages/mooter-bridge/sync.test.js'
) @"
ci: a bateria da bridge entra no CI, e o .gitignore deixa de ser uma armadilha

- packages/mooter-bridge corria INTEIRO fora do CI. Uma sessao chegou a
  anunciar "140 testes verdes" tendo corrido 11 dos 29 ficheiros. Um
  numero que ninguem verifica nao e uma prova. Agora `node --test` corre
  no CI, mais o gate de entrega isolado para o vermelho dizer JA qual
  ficheiro e qual marcador se partiram.

- `sync:check` NAO entra como gate, de proposito, e o porque fica escrito
  no proprio workflow: o SYNC.md projecta estado lido ao vivo do ledger
  local, que no runner nao existe - o passo seria vermelho SEMPRE por
  razoes de ambiente, nao por deriva real. Um gate que da falsos
  vermelhos acaba desligado, e um guarda desligado nao guarda nada. O que
  se verifica sem mentir e que o gerador carrega, mantem o contrato e que
  a mascara do HEAD ainda reconhece o que o renderSync produz.

- 18 ficheiros .jsonl estavam versionados so por acidente historico:
  entraram no indice antes de a regra `*.jsonl` existir, e o .gitignore
  nao afecta o que ja e tracked. Bastava um `git rm --cached` numa
  limpeza para o padrao largo os re-ignorar NA HORA e desaparecerem sem
  aviso - sao os corpora que tornam os numeros das waves 1.5 e 23
  reproduziveis. Ficam com excepcoes `!` explicitas e um comentario a
  dizer que sao um cinto de seguranca, nao decoracao.
  Verificado: `git check-ignore` deixou de apanhar os 18.

- Artefactos de sessao passam a ser ignorados. Medido: 690 ficheiros por
  commitar, 635 deles lixo - 262 pastas temporarias em scripts/ (o
  mkdtempSync resolveu o tmpdir para dentro do repo) e ~150 saidas de
  runners. Um `git status` com 690 linhas deixa de servir para ver o que
  mudou, que e a unica coisa para que serve. Os briefs (.md) e os runners
  (.ps1) continuam versionados: sao a memoria de como as coisas foram
  feitas, nao o rasto de que aconteceram.
"@ 'gates'

# --- 3. memoria: os briefs e runners desta sessao -------------------------
git add -- '_handoff/*.md' 2>&1 | Out-Null
git add -- '_handoff/*.ps1' 2>&1 | Out-Null
Commit @() @"
docs(handoff): versionar os briefs e runners das sessoes

Estavam por commitar ha semanas. Sao a memoria de COMO cada onda foi
decidida e executada - o brief que a originou e o runner nativo que a
comitou. O lixo (saidas, consoles, bundles) ficou de fora pelo .gitignore
do commit anterior.
"@ 'memoria'

"== push ==" | Out-File -Encoding ascii -Append $log
git push origin HEAD 2>&1 | Out-File -Encoding ascii -Append $log
(git status -sb | Select-Object -First 1) | Out-File -Encoding ascii -Append $log
"== untracked depois ==" | Out-File -Encoding ascii -Append $log
((git status --porcelain | Where-Object { $_ -like '?? *' }).Count) | Out-File -Encoding ascii -Append $log

"== instalar a v1.25.0 ==" | Out-File -Encoding ascii -Append $log
Set-Location 'C:\Users\Paulo Loureiro\frugal\_handoff'
node instalar-nativo.js 2>&1 | Out-File -Encoding ascii -Append $log
"FIM" | Out-File -Encoding ascii -Append $log
