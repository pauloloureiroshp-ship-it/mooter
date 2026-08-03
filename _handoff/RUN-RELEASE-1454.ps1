# RUN-RELEASE-1454.ps1 - publica o conector v1.45.4 (P1 do estranho + 4 fixes de integridade).
# Derivado do RUN-RELEASE-1453.ps1. O Paulo da 1 duplo-clique no .bat, ou corre-o com
# -RespostaOAuth para o agente o poder correr sem terminal interactivo.
# Idempotente. Verifica-antes-de-agir. Nunca "verde de fe": confirma o conteudo DENTRO do zip.
# ASCII only.
#
# O QUE MUDA FACE A 1453 (e porque)
#   1. A verificacao de conteudo passa a cobrir o P1 desta release (onboarding.js,
#      radar.js, sinal-valor.js) alem dos invariantes herdados (D13, caminhos com espaco).
#   2. Passo NOVO: md5 ficheiro-a-ficheiro do bundle contra HEAD. O gotcha da Wave K
#      (fatia-local.js fora de FILES) provou que um bundle que ABRE nao e um bundle
#      COMPLETO. Aqui cada entrada do zip tem de ser byte-a-byte igual ao blob em HEAD,
#      e nenhuma entrada pode existir a mais.
#   3. Confirma no fim que a release tem MESMO o asset .mcpb anexado - ja aconteceu
#      sair uma tag sem artefacto, e uma tag sem asset nao actualiza desktop nenhum.
param([string]$RespostaOAuth = '')

$ErrorActionPreference = 'Stop'
$Interactivo = [string]::IsNullOrWhiteSpace($RespostaOAuth)
$repo = 'C:\Users\Paulo Loureiro\frugal'
$log  = Join-Path $repo '_handoff\release-1454.log'
$SHA_FROZEN = '427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f'
$TAG  = 'v1.45.4'
$VER  = '1.45.4'

function Say($m) { $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m; Write-Host $line; Add-Content -Path $log -Value $line }
function Die($m) { Say "ABORTADO: $m"; if ($Interactivo) { Read-Host "`nEnter para fechar" }; exit 1 }

Set-Content -Path $log -Value ("=== release 1.45.4 - {0} ===" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Set-Location $repo
Say ("node: " + (node -v))

# 0. TRAVA DE SEGURANCA (CISO) - o secret do GitHub OAuth exposto em plaintext pela
#    Management API da Supabase (~abril 2026). Nao sai artefacto publico novo sem
#    resposta. Runbook: _handoff/ROTACAO-OAUTH-RUNBOOK.md
Write-Host ""
Write-Host "  ROTACAO DO SECRET OAUTH (GitHub) - runbook em _handoff\ROTACAO-OAUTH-RUNBOOK.md"
Write-Host "  Escreve 'rodei' se ja rodaste, ou 'vou rodar' se vais rodar hoje."
Write-Host "  Qualquer outra coisa aborta - de proposito."
if ($Interactivo) {
  $resp = (Read-Host "  resposta").Trim().ToLower()
  $fonte = 'prompt no terminal'
} else {
  $resp = $RespostaOAuth.Trim().ToLower()
  $fonte = 'parametro -RespostaOAuth (dono respondeu no chat)'
}
if ($resp -ne 'rodei' -and $resp -ne 'vou rodar') {
  Die "rotacao do OAuth nao confirmada (resposta: '$resp'). Seguranca provada > velocidade de release."
}
Say "rotacao OAuth: declarada pelo dono como '$resp' (fonte: $fonte)"

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

$mcpb = Join-Path $repo '_handoff\mooter-v1454.mcpb'
if (-not (Test-Path $mcpb)) { Die "o bundle nao apareceu em $mcpb" }
$kb = [math]::Round((Get-Item $mcpb).Length / 1KB)
$mcpbMd5 = (Get-FileHash $mcpb -Algorithm MD5).Hash.ToLower()
$mcpbSha = (Get-FileHash $mcpb -Algorithm SHA256).Hash.ToLower()
Say "bundle: $mcpb ($kb KB)"
Say "bundle md5:    $mcpbMd5"
Say "bundle sha256: $mcpbSha"

Add-Type -AssemblyName System.IO.Compression.FileSystem

# 6. BUNDLE == REPO, FICHEIRO A FICHEIRO.
#    O pack tem uma lista FILES a mao, e uma lista a mao esquece-se: a Wave K fechou
#    com fatia-local.js de fora e o .mcpb abria na mesma. Aqui cada entrada do zip e
#    comparada por hash de blob contra HEAD, e o conjunto tem de bater certo nos dois
#    sentidos (nada a faltar, nada a mais).
Say "--- bundle vs HEAD (ficheiro a ficheiro) ---"
$packSrc = Get-Content 'packages\mooter-bridge\pack-mcpb.mjs' -Raw
$bloco = [regex]::Match($packSrc, 'const FILES = \[([\s\S]*?)\n\];')
if (-not $bloco.Success) { Die "nao consegui ler a lista FILES do pack-mcpb.mjs" }
$pares = [regex]::Matches($bloco.Groups[1].Value, "\[\s*['""]([^'""]+)['""]\s*,\s*['""]([^'""]+)['""]\s*\]")
if ($pares.Count -eq 0) { Die "a lista FILES do pack-mcpb.mjs veio vazia" }

$zip = [System.IO.Compression.ZipFile]::OpenRead($mcpb)
try {
  $noZip = @{}
  foreach ($e in $zip.Entries) { $noZip[$e.FullName] = $e }
  $divergencias = @()
  $declarados = @{}
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("mooter-verify-" + [guid]::NewGuid().ToString('N'))

  foreach ($par in $pares) {
    $src  = $par.Groups[1].Value
    $dest = $par.Groups[2].Value
    $declarados[$dest] = $true
    # caminho no repo, a partir da pasta da bridge
    $rp = ('packages/mooter-bridge/' + $src) -replace '\\', '/'
    while ($rp -match '[^/]+/\.\./') { $rp = $rp -replace '[^/]+/\.\./', '' }

    if (-not $noZip.ContainsKey($dest)) { $divergencias += "FALTA NO BUNDLE: $dest (declarado a partir de $rp)"; continue }

    $inp = $noZip[$dest].Open()
    $out = [System.IO.File]::Create($tmp)
    $inp.CopyTo($out); $out.Close(); $inp.Close()

    $hZip = (& git hash-object --no-filters $tmp).Trim()
    # git rev-parse falha (exit != 0 + stderr) quando o caminho nao existe em HEAD.
    # Em pwsh 7.4 um exit != 0 de comando nativo pode ser lancado como erro terminante,
    # por isso este e o unico sitio do script que precisa de try/catch: a ausencia em
    # HEAD e um resultado esperado, nao uma avaria.
    $hHead = $null
    try { $hHead = (& git rev-parse "HEAD:$rp" 2>$null) } catch { $hHead = $null }
    if ([string]::IsNullOrWhiteSpace($hHead)) {
      $divergencias += "NAO VERSIONADO: $rp entra no bundle mas nao existe em HEAD"
      continue
    }
    if ($hZip -ne $hHead.Trim()) { $divergencias += "DIVERGE: $dest  zip=$hZip  HEAD:$rp=$($hHead.Trim())" }
  }
  if (Test-Path $tmp) { Remove-Item $tmp -Force }

  foreach ($k in $noZip.Keys) { if (-not $declarados.ContainsKey($k)) { $divergencias += "A MAIS NO BUNDLE: $k nao esta em FILES" } }

  if ($divergencias.Count -gt 0) {
    $divergencias | ForEach-Object { Say "   $_" }
    Die ("bundle != HEAD em {0} ficheiro(s). Nao publico um bundle que nao e o repo." -f $divergencias.Count)
  }
  Say ("bundle == HEAD: {0}/{0} ficheiros iguais, 0 a mais" -f $pares.Count)

  # 7. NUNCA VERDE DE FE - o que a 1.45.4 promete tem de estar DENTRO do zip.
  function LerDoZip($z, $padrao) {
    $e = $z.Entries | Where-Object { $_.FullName -like $padrao } | Select-Object -First 1
    if (-not $e) { return $null }
    $sr = New-Object System.IO.StreamReader($e.Open())
    $b = $sr.ReadToEnd(); $sr.Close()
    return @{ nome = $e.FullName; corpo = $b }
  }

  # (a) invariante da 1.45.2 - caminhos com espaco
  $ctx = LerDoZip $zip '*context.js'
  if (-not $ctx) { Die "context.js NAO esta dentro do bundle" }
  if ($ctx.corpo -notmatch '\[A-Za-z\]\[') { Die "regressao: context.js sem o fix de caminhos com espaco" }
  Say ("fix de caminhos com espaco CONFIRMADO em " + $ctx.nome)

  # (b) invariante da 1.45.3 - oraculo D13
  $ora = LerDoZip $zip '*oraculo.js'
  if (-not $ora) { Die "oraculo.js NAO esta dentro do bundle" }
  if ($ora.corpo -notmatch 'D13|d13') { Die "oraculo.js no bundle nao tem o D13 - regressao face a 1.45.3" }
  Say ("oraculo D13 CONFIRMADO em " + $ora.nome)

  # (c) o P1 - a razao desta release. Sem estes 3, a 1.45.4 nao entrega nada de novo.
  foreach ($f in @('onboarding.js', 'radar.js', 'sinal-valor.js')) {
    $e = LerDoZip $zip ('*server/' + $f)
    if (-not $e) { Die "$f NAO esta dentro do bundle - o P1 nao seguiu, e o P1 e o motivo desta release" }
    if ($e.corpo.Length -lt 800) { Die "$f no bundle tem $($e.corpo.Length) chars - vazio ou regredido" }
    Say ("P1 CONFIRMADO: " + $e.nome + " (" + $e.corpo.Length + " chars)")
  }
  $t6 = LerDoZip $zip '*server/tools6.js'
  if (-not $t6) { Die "tools6.js NAO esta dentro do bundle" }
  foreach ($f in @('onboarding.js', 'radar.js', 'sinal-valor.js')) {
    if ($t6.corpo -notmatch [regex]::Escape($f)) { Die "tools6.js no bundle nao liga a $f - o P1 estaria la mas morto" }
  }
  Say "tools6.js liga aos 3 modulos do P1: OK"

  # (d) a versao dentro do bundle
  $vj = LerDoZip $zip '*server/version.json'
  if ($vj -and $vj.corpo -notmatch [regex]::Escape($VER)) { Die "version.json dentro do bundle nao diz $VER" }
  if ($vj) { Say "version.json dentro do bundle: $VER OK" }
  $mf = LerDoZip $zip 'manifest.json'
  if (-not $mf -or $mf.corpo -notmatch [regex]::Escape('"version": "' + $VER + '"')) { Die "manifest.json dentro do bundle nao diz $VER" }
  Say "manifest.json dentro do bundle: $VER OK"

  # (e) o classificador congelado tambem viaja congelado
  $cl = $zip.Entries | Where-Object { $_.FullName -eq 'server/classify.js' } | Select-Object -First 1
  if (-not $cl) { Die "classify.js NAO esta dentro do bundle" }
  $ms = New-Object System.IO.MemoryStream
  $st = $cl.Open(); $st.CopyTo($ms); $st.Close()
  $shaZip = [BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash($ms.ToArray())).Replace('-','').ToLower()
  $ms.Close()
  if ($shaZip -ne $SHA_FROZEN) { Die "classify.js DENTRO do bundle nao e o congelado. obtido=$shaZip" }
  Say "classify.js dentro do bundle: sha congelado OK"
} finally { $zip.Dispose() }

# 8. publicar (o passo irreversivel; lancar este script foi a autorizacao)
Say "--- gh release ---"
$existe = & gh release view $TAG 2>&1
if ($LASTEXITCODE -eq 0) {
  Say "release $TAG ja existe - a substituir o asset (idempotente)"
  & gh release upload $TAG $mcpb --clobber 2>&1 | ForEach-Object { Say "   $_" }
} else {
  $notas = @"
Mooter conector v1.45.4

O QUE MUDA PARA QUEM INSTALA
- onboarding: os 5 gaps fechados + first-run real (server/onboarding.js)
- Setup Radar: o momento-aha do estranho, so leitura (server/radar.js)
- sinal de valor local (server/sinal-valor.js)
- 4 fixes de integridade no despacho e no recibo (server/tools6.js): o vermelho
  mudo passa a dizer a causa, os achados do G4 (motor diferente do autor), e a
  falha do recibo deixa de ser muda.

O QUE NAO VEM NESTE BUNDLE (de proposito, para nao prometer o que nao leva)
- fix(preflight) do .trim() cego: vive em tools/handoff-preflight.js, ferramenta
  do repo. Nao e ficheiro do servidor, nao viaja no .mcpb.
- alteracoes de tese/docs (AGENTS.md, CLAUDE.md, README.md) e o repontar do vault
  nos handoffs: repo, nao runtime.
- hooks do Claude Code (inject_context.js e afins) chegam por /mooter-update, nunca
  por este bundle.

PROVA NO MOMENTO DA PUBLICACAO (ver _handoff/release-1454.log)
- classify.js sha256 427d8c0b...4bc48f intacto, no repo E dentro do bundle
- wave-gate exit=0 (o script aborta se a suite piorar)
- bundle == HEAD ficheiro-a-ficheiro por hash de blob, 0 a faltar e 0 a mais
"@
  & gh release create $TAG $mcpb --title "Mooter v1.45.4" --notes $notas 2>&1 | ForEach-Object { Say "   $_" }
}
if ($LASTEXITCODE -ne 0) { Die "gh release falhou com exit=$LASTEXITCODE" }

# 9. UMA TAG NAO E UMA RELEASE. Ja saiu release sem .mcpb anexado - e uma release
#    sem asset nao actualiza desktop nenhum. Confirma o artefacto, nao so a tag.
$assets = & gh release view $TAG --json assets -q '.assets[].name' 2>$null
if (-not $assets -or ($assets -notmatch '\.mcpb$')) {
  Die "a release $TAG existe mas NAO tem asset .mcpb anexado (assets: $assets). Nada para instalar."
}
$assets | ForEach-Object { Say "asset anexado: $_" }
$url = & gh release view $TAG --json url -q .url 2>$null
Say "release publicada: $url"
Say "bundle final: $mcpb  md5=$mcpbMd5"
Say "FEITO. Falta instalar o .mcpb no Claude Desktop e reiniciar (o conector a correr ainda e o antigo)."
if ($Interactivo) { Read-Host "`nEnter para fechar" }
