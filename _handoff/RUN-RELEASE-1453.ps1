# RUN-RELEASE-1453.ps1 - publica o conector v1.45.3 (oraculo D13 + intent-outcome do PR #267).
# Preparado pela frota em 2026-08-01 (wave PRIME-0). O Paulo da 1 duplo-clique no .bat.
# Idempotente. Verifica-antes-de-agir. Nunca "verde de fe": confirma o conteudo DENTRO do zip.
# ASCII only.

$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
$log  = Join-Path $repo '_handoff\release-1453.log'
$SHA_FROZEN = '427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f'
$TAG  = 'v1.45.3'
$VER  = '1.45.3'

function Say($m) { $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m; Write-Host $line; Add-Content -Path $log -Value $line }
function Die($m) { Say "ABORTADO: $m"; Read-Host "`nEnter para fechar"; exit 1 }

Set-Content -Path $log -Value ("=== release 1.45.3 - {0} ===" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Set-Location $repo
Say ("node: " + (node -v))

# 0. TRAVA DE SEGURANCA (CISO) - o §4b do HIPERMASTER deixa de ser uma frase num
#    documento e passa a ser codigo. O secret do GitHub OAuth exposto em plaintext
#    pela Management API da Supabase (~abril 2026) nao tem confirmacao de rotacao
#    em 3+ meses de vault nem SYNC. Nao sai artefacto publico novo sem resposta.
#    Passo-a-passo da rotacao: _handoff/ROTACAO-OAUTH-RUNBOOK.md
Write-Host ""
Write-Host "  ROTACAO DO SECRET OAUTH (GitHub) - runbook em _handoff\ROTACAO-OAUTH-RUNBOOK.md"
Write-Host "  Escreve 'rodei' se ja rodaste, ou 'vou rodar' se vais rodar hoje."
Write-Host "  Qualquer outra coisa aborta - de proposito."
$resp = (Read-Host "  resposta").Trim().ToLower()
if ($resp -ne 'rodei' -and $resp -ne 'vou rodar') {
  Die "rotacao do OAuth nao confirmada (resposta: '$resp'). Seguranca provada > velocidade de release."
}
Say "rotacao OAuth: declarada pelo dono como '$resp'"

# 1. o push TEM de ter acontecido - publicar codigo que nao esta no remoto e mentir
git fetch origin main --quiet
$pend = (git rev-list --count 'origin/main..HEAD')
if ($pend -ne '0') { Die "ha $pend commit(s) por empurrar. Faz o push do branch antes." }
$head = (git rev-parse HEAD)
Say "origin/main == HEAD == $head  OK"

# 2. invariante congelado
$sha = (Get-FileHash 'tools\router\classify.js' -Algorithm SHA256).Hash.ToLower()
if ($sha -ne $SHA_FROZEN) { Die "classify.js MUDOU. esperado=$SHA_FROZEN obtido=$sha" }
Say "classify.js congelado: OK"

# 3. as versoes tem de casar entre si (o namespace ja se desalinhou uma vez)
$vRouter = (Get-Content 'tools\router\version.json' -Raw | ConvertFrom-Json).version
$vBridge = (Get-Content 'packages\mooter-bridge\manifest.json' -Raw | ConvertFrom-Json).version
if ($vRouter -ne $VER) { Die "tools/router/version.json diz $vRouter, esperado $VER" }
if ($vBridge -ne $VER) { Die "manifest.json diz $vBridge, esperado $VER" }
Say "versoes alinhadas: router=$vRouter bridge=$vBridge"

# 4. gate antes de qualquer artefacto publico
Say "--- wave-gate ---"
$g = & node 'tools\wave-gate.mjs' 2>&1
$g | ForEach-Object { Say "   $_" }
if ($LASTEXITCODE -ne 0) { Die "wave-gate exit=$LASTEXITCODE. Nao se publica com a suite pior." }
Say "gate: exit=0 VERDE"

# 5. reconstruir o bundle
Say "--- pack-mcpb ---"
Push-Location 'packages\mooter-bridge'
$p = & node 'pack-mcpb.mjs' 2>&1
Pop-Location
$p | ForEach-Object { Say "   $_" }
if ($LASTEXITCODE -ne 0) { Die "pack-mcpb falhou com exit=$LASTEXITCODE" }

$mcpb = Join-Path $repo '_handoff\mooter-v1453.mcpb'
if (-not (Test-Path $mcpb)) { Die "o bundle nao apareceu em $mcpb" }
$kb = [math]::Round((Get-Item $mcpb).Length / 1KB)
Say "bundle: $mcpb ($kb KB)"

# 6. NUNCA VERDE DE FE - o que a 1.45.3 promete tem de estar DENTRO do zip.
#    (a) o fix de caminhos com espaco da 1.45.2 nao pode ter regredido
#    (b) o oraculo D13 do PR #267 tem de estar la - e o unico motivo desta release
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($mcpb)
try {
  $ctx = $zip.Entries | Where-Object { $_.FullName -like '*context.js' } | Select-Object -First 1
  if (-not $ctx) { Die "context.js NAO esta dentro do bundle" }
  $sr = New-Object System.IO.StreamReader($ctx.Open()); $body = $sr.ReadToEnd(); $sr.Close()
  if ($body -notmatch '\[A-Za-z\]:\[') { Die "regressao: context.js sem o fix de caminhos com espaco" }
  Say ("fix de caminhos com espaco CONFIRMADO em " + $ctx.FullName)

  $ora = $zip.Entries | Where-Object { $_.FullName -like '*oraculo.js' } | Select-Object -First 1
  if (-not $ora) { Die "oraculo.js NAO esta dentro do bundle - a razao desta release nao seguiu" }
  $sr2 = New-Object System.IO.StreamReader($ora.Open()); $ob = $sr2.ReadToEnd(); $sr2.Close()
  if ($ob -notmatch 'D13|d13') { Die "oraculo.js no bundle nao tem o D13. Nao publico uma release que promete o que nao leva." }
  Say ("oraculo D13 CONFIRMADO em " + $ora.FullName)

  $vj = $zip.Entries | Where-Object { $_.FullName -like '*server/version.json' } | Select-Object -First 1
  if ($vj) {
    $sr3 = New-Object System.IO.StreamReader($vj.Open()); $vb = $sr3.ReadToEnd(); $sr3.Close()
    if ($vb -notmatch [regex]::Escape($VER)) { Die "version.json dentro do bundle nao diz $VER" }
    Say "version.json dentro do bundle: $VER OK"
  }
} finally { $zip.Dispose() }

# 7. publicar (o passo irreversivel; lancar este script foi a autorizacao)
Say "--- gh release ---"
$existe = & gh release view $TAG 2>&1
if ($LASTEXITCODE -eq 0) {
  Say "release $TAG ja existe - a substituir o asset (idempotente)"
  & gh release upload $TAG $mcpb --clobber 2>&1 | ForEach-Object { Say "   $_" }
} else {
  $notas = @"
Mooter conector v1.45.3

- oraculo: D13 e o par intent-outcome chegam ao conector (PR #267). Estavam no
  repo desde o merge, mas o conector a correr era o bundle da 1.45.2 e nao os via.
- ledger-turn-io + privacy: entram no runtime do Claude Code por /mooter-update,
  nao por este bundle.

NAO vem nesta release: o fix do USER_OVERRIDE fantasma (tools/router/
user-override-guard.js). Esse vive nos hooks do Claude Code e chega por
/mooter-update - o .mcpb nao transporta inject_context.js.

Gate no momento da publicacao: ver release-1453.log (o script aborta se piorar).
"@
  & gh release create $TAG $mcpb --title "Mooter v1.45.3" --notes $notas 2>&1 | ForEach-Object { Say "   $_" }
}
if ($LASTEXITCODE -ne 0) { Die "gh release falhou com exit=$LASTEXITCODE" }

$url = & gh release view $TAG --json url -q .url 2>$null
Say "release publicada: $url"
Say "FEITO. Falta instalar o .mcpb no Claude Desktop e reiniciar (o conector a correr ainda e o antigo)."
Read-Host "`nEnter para fechar"
