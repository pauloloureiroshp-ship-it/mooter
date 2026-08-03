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

<#
  Nativo — correr um comando externo sem que o `2>&1` o transforme em excepcao.

  MEDIDO nas duas conchas, com `cmd /c "echo boom 1>&2 & exit 1"` e
  $ErrorActionPreference='Stop':
    Windows PowerShell 5.1.26100.8972  -> LANCA erro terminante
    pwsh 7.6.4                         -> nao lanca, LASTEXITCODE=1

  O .bat invoca `powershell`, ou seja a 5.1. Como `gh release view <tag>` escreve
  em stderr quando a tag ainda NAO existe — que e exactamente o caso da primeira
  publicacao — o `if ($LASTEXITCODE -eq 0)` nunca chegava a ser avaliado e o
  script morria ANTES do `gh release create`. Pior no `create`: o `gh` escreve
  progresso em stderr, por isso a excepcao apanhava o script DEPOIS de a release
  ja existir, deixando-a sem a verificacao final do asset.

  Aqui o ErrorActionPreference desce a 'Continue' so durante a chamada nativa. O
  codigo de saida continua a ser lido a seguir — nao se perde nenhum sinal, so
  se deixa de confundir "escreveu em stderr" com "falhou".
#>
function Nativo([scriptblock]$bloco) {
  $antes = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $bloco } finally { $ErrorActionPreference = $antes }
}

# append, nao Set-Content: o caminho idempotente (re-upload do asset) corre este
# script uma segunda vez, e truncar apagaria a prova da primeira publicacao.
Add-Content -Path $log -Value ("`n=== release 1.45.4 - {0} ===" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
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

# 1. o push TEM de ter acontecido - publicar codigo que nao esta no remoto e mentir.
#    Igualdade, nao contagem: `rev-list --count origin/main..HEAD` tambem da 0 quando
#    HEAD esta ATRAS do remoto, e ai o log afirmava uma igualdade que nao mediu. Com
#    sessoes paralelas a empurrar para main, esse caso e real, nao teorico.
Nativo { git fetch origin main --quiet } | Out-Null
$head   = (Nativo { git rev-parse HEAD }).Trim()
$remoto = (Nativo { git rev-parse origin/main }).Trim()
if ($head -ne $remoto) {
  $pend  = (Nativo { git rev-list --count 'origin/main..HEAD' })
  $atras = (Nativo { git rev-list --count 'HEAD..origin/main' })
  Die "origin/main ($remoto) != HEAD ($head): $pend por empurrar, $atras por puxar. Alinha antes de publicar."
}
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
$g = Nativo { & node 'tools\wave-gate.mjs' 2>&1 }
$g | ForEach-Object { Say "   $_" }
if ($LASTEXITCODE -ne 0) { Die "wave-gate exit=$LASTEXITCODE. Nao se publica com a suite pior." }
Say "gate: exit=0 VERDE"

# 5. reconstruir o bundle
Say "--- pack-mcpb ---"
Push-Location 'packages\mooter-bridge'
$p = Nativo { & node 'pack-mcpb.mjs' 2>&1 }
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

    $hZip = (Nativo { & git hash-object --no-filters $tmp }).Trim()
    # git rev-parse falha (exit != 0 + stderr) quando o caminho nao existe em HEAD.
    # MEDIDO em pwsh 7.6.4: $PSNativeCommandUseErrorActionPreference = False, logo um
    # exit != 0 nativo NAO e lancado e o try/catch e defensivo, nao necessario. Fica
    # porque quem correr isto com essa preferencia ligada (ou noutra versao que mude o
    # default) veria o script morrer aqui em vez de registar a divergencia. A ausencia
    # em HEAD e um resultado esperado deste ciclo, nao uma avaria.
    $hHead = $null
    try { $hHead = (Nativo { & git rev-parse "HEAD:$rp" 2>$null }) } catch { $hHead = $null }
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
  # o ':' NAO e decorativo - o padrao real em context.js:57 e /[A-Za-z]:[\\/]...
  # (transcrever isto sem os dois pontos fez o gate acusar regressao num ficheiro
  # byte-a-byte igual a HEAD. Apanhado pelo final-reviewer antes de publicar.)
  if ($ctx.corpo -notmatch '\[A-Za-z\]:\[') { Die "regressao: context.js sem o fix de caminhos com espaco" }
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
  # LIGACAO, nao mencao. Procurar a substring 'radar.js' dava verde a um comentario
  # ou a uma string de log: tirava-se o require e o gate continuava a dizer OK. O
  # que prova que o modulo esta VIVO e o proprio require.
  $t6 = LerDoZip $zip '*server/tools6.js'
  if (-not $t6) { Die "tools6.js NAO esta dentro do bundle" }
  foreach ($f in @('onboarding.js', 'radar.js', 'sinal-valor.js')) {
    $req = "require\(\s*['`"]\./" + [regex]::Escape($f) + "['`"]\s*\)"
    if ($t6.corpo -notmatch $req) { Die "tools6.js no bundle nao tem require('./$f) - o P1 estaria la mas morto" }
  }
  Say "tools6.js tem require() real dos 3 modulos do P1: OK"

  # (c2) o GAP 5 do onboarding: o install-id so persiste se o manifest viajar TAMBEM
  #      dentro de server/. Sem esta entrada, `require('./manifest.json')` do
  #      install-id.js rebenta depois de instalado e o painel mente ao dizer
  #      "persistente". Medido numa instalacao limpa antes de existir esta linha.
  $mfServer = $zip.Entries | Where-Object { $_.FullName -eq 'server/manifest.json' } | Select-Object -First 1
  if (-not $mfServer) { Die "server/manifest.json NAO esta no bundle - o install-id volta a ser efemero em silencio (GAP 5)" }
  Say "server/manifest.json presente: o install-id consegue persistir OK"

  # (d) a versao dentro do bundle
  # sem o `if (-not $vj) Die`, a asserção passava por AUSENCIA - exactamente o
  # "verde de fe" que o cabecalho deste script diz combater.
  $vj = LerDoZip $zip '*server/version.json'
  if (-not $vj) { Die "server/version.json NAO esta dentro do bundle" }
  if ($vj.corpo -notmatch [regex]::Escape($VER)) { Die "version.json dentro do bundle nao diz $VER" }
  Say "version.json dentro do bundle: $VER OK"
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
$existe = Nativo { & gh release view $TAG 2>&1 }
if ($LASTEXITCODE -eq 0) {
  # IDEMPOTENTE NAO E CEGO. Substituir o asset de uma release que ja existe so e
  # seguro se essa release apontar para o MESMO commit de onde este bundle saiu.
  # Se apontar para outro, o `publish-mcpb.yml` (que reconstroi a partir da TAG e
  # faz --clobber) acaba por sobrepor o asset correcto por um bundle do commit
  # errado — e o script diria FEITO.
  $alvo = (Nativo { & gh release view $TAG --json targetCommitish -q .targetCommitish 2>$null })
  $shaTag = (Nativo { & gh api "repos/:owner/:repo/git/ref/tags/$TAG" -q .object.sha 2>$null })
  if ($shaTag) { $shaTag = $shaTag.Trim() }
  if ($shaTag -and $shaTag -ne $head) {
    Die "a release $TAG ja existe mas a tag aponta para $shaTag, nao para o HEAD deste bundle ($head). Nao substituo o asset as cegas."
  }
  Say "release $TAG ja existe e a tag aponta para $head (alvo declarado: $alvo) - a substituir o asset"
  Nativo { & gh release upload $TAG $mcpb --clobber 2>&1 } | ForEach-Object { Say "   $_" }
} else {
  <#
    NOTAS POR FICHEIRO, NAO POR ARGUMENTO.

    MEDIDO na primeira tentativa de publicacao (2026-08-03 08:46): passar o texto
    em `--notes $notas` fez o Windows PowerShell 5.1 partir o argumento nas aspas
    embebidas ("sem permissao de escrita"), e o `gh` leu os fragmentos como
    ficheiros de asset:  no matches found for `permissao`  -> exit 1.
    A release nao chegou a ser criada, o que so por sorte nao deixou meia release
    publicada. `--notes-file` nao passa por nenhuma camada de quoting.

    E here-string LITERAL (@'...'@), nao interpolante: o texto tem backticks a
    volta de nomes de ficheiro, e num @"..."@ o backtick e o caracter de escape —
    desaparecia silenciosamente do texto publicado.
  #>
  $notas = @'
Mooter conector v1.45.4

O QUE MUDA PARA QUEM INSTALA
- onboarding: os 5 gaps fechados + first-run real (server/onboarding.js)
- Setup Radar: o momento-aha do estranho, so leitura (server/radar.js)
- sinal de valor local (server/sinal-valor.js)
- 3 fixes de integridade no despacho e no recibo (server/tools6.js): o vermelho
  mudo passa a dizer a causa, os achados do G4 (motor diferente do autor), e a
  falha do recibo deixa de ser muda.
- o GAP 5 do onboarding fecha-se DE FACTO: `install-id.js` fazia
  `require('./manifest.json')`, que resolvia no repo e rebentava no bundle
  (install-id.js em server/, manifest na raiz do zip). O erro era engolido pelo
  catch escrito para "sem permissao de escrita", ~/.mooter/install-id.json nunca
  era escrito, o painel dizia "persistente (gerada agora)" sem ter persistido
  nada, e cada sessao voltava a dizer "primeira vez". Herdado desde a v1.29.0 e
  presente em todas as releases ate a 1.45.3, inclusive.

O QUE NAO VEM NESTE BUNDLE (de proposito, para nao prometer o que nao leva)
- fix(preflight) do .trim() cego: vive em tools/handoff-preflight.js, ferramenta
  do repo. Nao e ficheiro do servidor, nao viaja no .mcpb. Sao 4 fixes no repo,
  3 no bundle.
- alteracoes de tese/docs (AGENTS.md, CLAUDE.md, README.md) e o repontar do vault
  nos handoffs: repo, nao runtime.
- hooks do Claude Code (inject_context.js e afins) chegam por /mooter-update, nunca
  por este bundle.

O QUE FOI PROVADO ANTES DE ESTE ARTEFACTO EXISTIR
O script que publicou esta release (_handoff/RUN-RELEASE-1454.ps1, versionado)
aborta - nao avisa, aborta - se qualquer destas falhar:
- classify.js com sha256 diferente de 427d8c0b...4bc48f, no repo OU dentro do zip
- wave-gate com exit != 0 (a suite pior do que o baseline versionado)
- qualquer entrada do zip diferente do blob em HEAD, ou uma entrada a mais
- onboarding.js / radar.js / sinal-valor.js ausentes, vazios, ou sem um
  require('./x.js') real no tools6.js (mencao numa string nao conta)
- manifest.json ou server/version.json dentro do zip a dizer outra versao
- qualquer require('./x.js'|'./x.json') que, DEPOIS de instalado, ficasse sem
  ficheiro ao lado — a verificacao do pack passou a resolver por destino, nao
  por nome, que e o que o Node faz mesmo
Le o script para veres as verificacoes; o log da corrida (_handoff/release-1454.log)
fica na maquina de quem publicou e nao e versionado.

BUNDLE
sha256 do .mcpb: impresso pelo pack-mcpb.mjs e no log local da corrida.
'@
  $notasFile = Join-Path $repo '_handoff\release-1454-notas.md'
  Set-Content -Path $notasFile -Value $notas -Encoding UTF8
  Say "notas em $notasFile ($((Get-Item $notasFile).Length) bytes)"
  Nativo { & gh release create $TAG $mcpb --title "Mooter v1.45.4" --notes-file $notasFile --target $head 2>&1 } | ForEach-Object { Say "   $_" }
}
if ($LASTEXITCODE -ne 0) { Die "gh release falhou com exit=$LASTEXITCODE" }

# 9. UMA TAG NAO E UMA RELEASE. Ja saiu release sem .mcpb anexado - e uma release
#    sem asset nao actualiza desktop nenhum. Confirma o artefacto, nao so a tag.
# `$array -notmatch 'x'` e um FILTRO, nao um booleano: um array com 2 assets em que
# so um bate devolve o outro, que e truthy, e o Die disparava DEPOIS do passo
# irreversivel. Teste explicito de "existe pelo menos um .mcpb".
$assets = @((Nativo { & gh release view $TAG --json assets -q '.assets[].name' 2>$null }) | Where-Object { $_ })
$mcpbAnexados = @($assets | Where-Object { $_ -like '*.mcpb' })
if ($mcpbAnexados.Count -lt 1) {
  Die ("a release $TAG existe mas NAO tem asset .mcpb anexado (assets: " + ($assets -join ', ') + "). Nada para instalar.")
}
$assets | ForEach-Object { Say "asset anexado: $_" }
$url = Nativo { & gh release view $TAG --json url -q .url 2>$null }
Say "release publicada: $url"
Say "bundle final: $mcpb  md5=$mcpbMd5"
Say "FEITO. Falta instalar o .mcpb no Claude Desktop e reiniciar (o conector a correr ainda e o antigo)."
if ($Interactivo) { Read-Host "`nEnter para fechar" }
