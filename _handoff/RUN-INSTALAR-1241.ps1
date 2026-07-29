# RUN-INSTALAR-1241.ps1 -- ASCII only, no BOM, PowerShell 5.1 safe
# Instala o bundle mooter-v1241.mcpb por cima da instalacao real da extensao
# (a pasta que o Claude Desktop realmente le, dentro do sandbox de app
# empacotada do Windows). Faz backup antes de escrever. NAO reinicia nada.

$ErrorActionPreference = 'Stop'

try {
    $repo = Split-Path -Parent $PSScriptRoot
    $mcpb = Join-Path $repo '_handoff\mooter-v1241.mcpb'
    $expectSha = '6103a903f305ea7e06d38db31361dcf09eb8ef9e822e1082350230afb260c84f'
    $expectVersion = '1.24.1'
    $extId = 'local.mcpb.paulo-loureiro.mooter'

    Write-Host ('=== RUN-INSTALAR-1241 === ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
    Write-Host ''

    # 1. o bundle e' o que foi gerado e testado na Fase 2
    Write-Host '[1] Bundle'
    if (-not (Test-Path $mcpb)) { throw ('PAROU: bundle nao encontrado em ' + $mcpb) }
    $size = (Get-Item $mcpb).Length
    $sha = (Get-FileHash $mcpb -Algorithm SHA256).Hash.ToLower()
    Write-Host ('    ficheiro : ' + $mcpb)
    Write-Host ('    tamanho  : ' + $size + ' bytes')
    Write-Host ('    sha256   : ' + $sha)
    if ($sha -ne $expectSha) {
        throw ('PAROU: sha256 nao bate com o esperado (' + $expectSha + ') - re-empacota antes de instalar')
    }
    Write-Host '    OK       : sha256 confere com o bundle gerado na Fase 2'
    Write-Host ''

    # 2. descobrir a pasta real da instalacao (o Packages sandbox, nao o repo)
    # Medido a 2026-07-27 (_handoff/instalar-saida.txt): a extensao que o
    # Claude Desktop realmente carrega vive em
    #   AppData\Local\Packages\Claude_<hash>\LocalCache\Roaming\Claude\Claude Extensions\<extId>
    # Procura-se por nome de pacote (wildcard, nao o hash fixo) para nao adivinhar.
    Write-Host '[2] A procurar a instalacao real'
    $packagesRoot = Join-Path $env:LOCALAPPDATA 'Packages'
    $candidatos = @()
    if (Test-Path $packagesRoot) {
        $pastasClaude = Get-ChildItem -Path $packagesRoot -Directory -Filter 'Claude_*' -ErrorAction SilentlyContinue
        foreach ($pc in $pastasClaude) {
            $serverDir = Join-Path $pc.FullName ('LocalCache\Roaming\Claude\Claude Extensions\' + $extId + '\server')
            $seamless = Join-Path $serverDir 'seamless.js'
            if ((Test-Path $serverDir) -and (Test-Path $seamless)) { $candidatos += $serverDir }
        }
    }

    Write-Host ('    candidatos encontrados: ' + $candidatos.Count)
    foreach ($c in $candidatos) { Write-Host ('      ' + $c) }
    if ($candidatos.Count -ne 1) {
        throw ('PAROU: esperava exactamente 1 pasta candidata, encontrei ' + $candidatos.Count + '. Nao instalo as cegas.')
    }
    $dest = $candidatos[0]
    $manifestPath = Join-Path (Split-Path $dest -Parent) 'manifest.json'
    if (-not (Test-Path $manifestPath)) { throw ('PAROU: nao encontrei manifest.json ao lado de ' + $dest) }
    Write-Host ''

    # 3. antes
    Write-Host '[3] Antes'
    $antes = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $antesInfo = Get-Item $manifestPath
    Write-Host ('    pasta      : ' + $dest)
    Write-Host ('    manifest   : ' + $manifestPath)
    Write-Host ('    versao     : ' + $antes.version)
    Write-Host ('    modificado : ' + $antesInfo.LastWriteTime)
    Write-Host ''

    # 4. backup antes de tocar em nada
    Write-Host '[4] Backup'
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $mooterDir = Join-Path $env:USERPROFILE '.mooter'
    $backup = Join-Path $mooterDir ('mooter-bridge.bak-' + $stamp)
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    $copiados = 0
    Get-ChildItem -Path $dest -File | ForEach-Object {
        Copy-Item $_.FullName -Destination (Join-Path $backup $_.Name) -Force
        $copiados = $copiados + 1
    }
    Copy-Item $manifestPath -Destination (Join-Path $backup 'manifest.json') -Force
    $copiados = $copiados + 1
    Write-Host ('    backup     : ' + $backup + ' (' + $copiados + ' ficheiro(s))')
    Write-Host ''

    # 5. instalar: extrair do .mcpb so manifest.json + server/*
    Write-Host '[5] A instalar'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zipArchive = [System.IO.Compression.ZipFile]::OpenRead($mcpb)
    $escritos = 0
    try {
        foreach ($entry in $zipArchive.Entries) {
            $alvo = $null
            if ($entry.FullName -eq 'manifest.json') { $alvo = $manifestPath }
            elseif ($entry.FullName.StartsWith('server/')) {
                $nome = Split-Path $entry.FullName -Leaf
                $alvo = Join-Path $dest $nome
            }
            if (-not $alvo) { continue }
            $tmp = $alvo + '.tmp-1241'
            $inStream = $entry.Open()
            $outStream = [System.IO.File]::Create($tmp)
            try { $inStream.CopyTo($outStream) }
            finally { $outStream.Close(); $inStream.Close() }
            Move-Item -Path $tmp -Destination $alvo -Force
            $escritos = $escritos + 1
        }
    } finally {
        $zipArchive.Dispose()
    }
    Write-Host ('    escritos   : ' + $escritos + ' ficheiro(s) (server/* + manifest.json)')
    Write-Host ''

    # 6. depois
    Write-Host '[6] Depois'
    $depois = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $depoisInfo = Get-Item $manifestPath
    Write-Host ('    versao     : ' + $depois.version)
    Write-Host ('    modificado : ' + $depoisInfo.LastWriteTime)

    # 7. confirmacao: o bundle usado continua o mesmo (sha256 re-verificado)
    $shaFinal = (Get-FileHash $mcpb -Algorithm SHA256).Hash.ToLower()
    Write-Host ''
    Write-Host '[7] Confirmacao'
    Write-Host ('    bundle sha256 (pos-instalacao) : ' + $shaFinal)
    Write-Host ('    bate com a Fase 2c             : ' + ($shaFinal -eq $expectSha))

    if ($depois.version -ne $expectVersion) {
        throw ('ATENCAO: o manifest nao ficou na versao esperada (' + $expectVersion + '), ficou em ' + $depois.version)
    }

    Write-Host ''
    Write-Host 'OK INSTALADO - fecha o Claude Desktop por completo e volta a abrir para o processo carregar o codigo novo'
    exit 0
} catch {
    Write-Host ''
    Write-Host ('FALHOU: ' + $_.Exception.Message)
    exit 1
}
