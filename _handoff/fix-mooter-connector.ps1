# fix-mooter-connector.ps1 -- diagnostico DECISIVO + correcao do conector mooter (2026-07-24)
#
# HIPOTESE PRIMARIA: apply-desktop-config-mooter.ps1 gravou o claude_desktop_config.json com
# "Out-File -Encoding utf8", que no PowerShell 5.1 emite BOM (EF BB BF). O Claude Desktop
# (Electron/Node) faz JSON.parse do ficheiro e JSON.parse REBENTA com BOM na posicao 0
# -> o config inteiro e' descartado -> o servidor 'mooter' nunca arranca.
# Evidencia (mesma maquina, mesmo cmdlet+flag): ledger-tail.txt, m1-dispatch.log e
# precheck-seamless.log comecam todos com EF BB BF. Os scripts m1-*.ps1 do mesmo dia JA
# usam UTF8Encoding($false) de proposito -- o script do config nao usou.
#
# Este script: (1) prova ou refuta com o MESMO parser do Desktop (node JSON.parse),
# (2) corrige sem BOM e garante a entrada 'mooter', (3) testa o servidor a frio,
# (4) escreve _handoff\fix-mooter-connector.log SEM BOM.
# Seguro: backup timestampado antes de qualquer escrita; valida o JSON antes de gravar;
# nao toca no git, nao faz push, nao apaga nada.
# ASCII-only de proposito (PS 5.1).

$ErrorActionPreference = 'Continue'
$repo    = "C:\Users\Paulo Loureiro\frugal"
$logPath = Join-Path $repo "_handoff\fix-mooter-connector.log"
$cfg     = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"
$srv     = Join-Path $repo "packages\mooter-bridge\server-seamless.js"
$L = New-Object System.Collections.ArrayList
function Say($s) { Write-Host $s; [void]$L.Add($s) }

Say "=== FIX MOOTER CONNECTOR $(Get-Date -Format o) ==="
Say "PSVersion: $($PSVersionTable.PSVersion)"
Say "config:    $cfg"
Say "server:    $srv  (existe: $(Test-Path $srv))"
Say ""

# ---------- 1. ESTADO ANTES ----------
Say "--- 1. ESTADO ANTES ---"
if (-not (Test-Path $cfg)) { Say "FATAL: config NAO EXISTE. Para aqui e reporta." ; [IO.File]::WriteAllText($logPath, ($L -join "`r`n"), (New-Object System.Text.UTF8Encoding($false))) ; exit 1 }

$bytes = [IO.File]::ReadAllBytes($cfg)
$first = ($bytes[0..([Math]::Min(3,$bytes.Length-1))] | ForEach-Object { $_.ToString('x2') }) -join ' '
$hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
Say "tamanho: $($bytes.Length) bytes"
Say "primeiros bytes: $first"
Say "TEM BOM: $hasBom   <-- se True, hipotese primaria CONFIRMADA na origem"

# o teste que decide: o MESMO parser que o Claude Desktop usa
$nodeCheck = cmd /c "node -e ""try{JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log('NODE_JSON_PARSE=OK')}catch(e){console.log('NODE_JSON_PARSE=FAIL '+e.message)}"" ""$cfg""" 2>&1
Say "veredicto do parser do Desktop -> $nodeCheck"
Say ""
Say "--- conteudo atual do config ---"
$textRaw = [Text.Encoding]::UTF8.GetString($bytes)
Say $textRaw.TrimStart([char]0xFEFF)
Say ""

# ---------- 2. LOGS MCP DO DESKTOP ----------
Say "--- 2. LOGS MCP DO DESKTOP (prova de arranque/crash) ---"
$logdir = Join-Path $env:APPDATA "Claude\logs"
if (Test-Path $logdir) {
  Get-ChildItem $logdir -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending |
    Select-Object -First 12 | ForEach-Object { Say ("  {0}  {1,8}  {2}" -f $_.LastWriteTime.ToString('MM-dd HH:mm:ss'), $_.Length, $_.Name) }
  Get-ChildItem $logdir -File -Filter "*mooter*" -ErrorAction SilentlyContinue | ForEach-Object {
    Say ">> $($_.Name) (tail 40)"; Get-Content $_.FullName -Tail 40 -ErrorAction SilentlyContinue | ForEach-Object { Say "   $_" }
  }
  $gen = Join-Path $logdir "mcp.log"
  if (Test-Path $gen) { Say ">> mcp.log (tail 60)"; Get-Content $gen -Tail 60 -ErrorAction SilentlyContinue | ForEach-Object { Say "   $_" } }
} else { Say "  logs dir NAO existe: $logdir" }
Say ""

# ---------- 3. CORRECAO (backup -> normalizar -> garantir mooter -> gravar SEM BOM) ----------
Say "--- 3. CORRECAO ---"
$backup = "$cfg.bak-fixbom-$(Get-Date -Format yyyyMMdd-HHmmss)"
Copy-Item $cfg $backup -Force
Say "backup: $backup"

$clean = $textRaw.TrimStart([char]0xFEFF)
try { $json = $clean | ConvertFrom-Json } catch { Say "FATAL: config invalido mesmo sem BOM: $($_.Exception.Message)"; Say "NAO gravei nada. Reporta este log."; [IO.File]::WriteAllText($logPath, ($L -join "`r`n"), (New-Object System.Text.UTF8Encoding($false))); exit 2 }

if (-not ($json.PSObject.Properties.Name -contains 'mcpServers')) {
  $json | Add-Member -MemberType NoteProperty -Name mcpServers -Value ([pscustomobject]@{})
  Say "mcpServers ausente -> criado"
}
$serverPathFwd = "C:/Users/Paulo Loureiro/frugal/packages/mooter-bridge/server-seamless.js"
$entry = [pscustomobject]@{ command = 'node'; args = @($serverPathFwd) }
if ($json.mcpServers.PSObject.Properties.Name -contains 'mooter') {
  $json.mcpServers.mooter = $entry; Say "entrada 'mooter' reafirmada"
} else {
  $json.mcpServers | Add-Member -MemberType NoteProperty -Name mooter -Value $entry; Say "entrada 'mooter' ADICIONADA (nao estava la)"
}
Say "servidores mcp declarados: $(($json.mcpServers.PSObject.Properties.Name) -join ', ')"

$out = $json | ConvertTo-Json -Depth 20
[IO.File]::WriteAllText($cfg, $out, (New-Object System.Text.UTF8Encoding($false)))
Say "gravado SEM BOM via UTF8Encoding(false)"
Say ""

# ---------- 4. ESTADO DEPOIS ----------
Say "--- 4. ESTADO DEPOIS ---"
$b2 = [IO.File]::ReadAllBytes($cfg)
$f2 = ($b2[0..([Math]::Min(3,$b2.Length-1))] | ForEach-Object { $_.ToString('x2') }) -join ' '
Say "primeiros bytes: $f2   (esperado: 7b ... = '{')"
$nodeCheck2 = cmd /c "node -e ""try{JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log('NODE_JSON_PARSE=OK')}catch(e){console.log('NODE_JSON_PARSE=FAIL '+e.message)}"" ""$cfg""" 2>&1
Say "veredicto do parser do Desktop -> $nodeCheck2"
Say ""

# ---------- 5. TESTE A FRIO DO SERVIDOR ----------
Say "--- 5. TESTE A FRIO DO SERVIDOR (initialize + tools/list) ---"
$nl = [char]10
$lines = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' + $nl + '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' + $nl
$tmpIn = Join-Path $env:TEMP "mooter-fix-in.jsonl"
[IO.File]::WriteAllText($tmpIn, $lines, (New-Object System.Text.UTF8Encoding($false)))
$res = cmd /c "node ""$srv"" < ""$tmpIn"" 2>&1"
$res | ForEach-Object { Say "   $_" }
Say ""

Say "=== PROXIMO PASSO OBRIGATORIO ==="
Say "1. FECHAR o Claude Desktop por completo (bandeja/tray incluida)."
Say "2. REABRIR o Claude Desktop."
Say "3. So DEPOIS abrir a task Cowork nova (Fable 5) -- o conjunto de conectores congela"
Say "   no nascimento da sessao, logo reiniciar com a sessao aberta nao resolve nada."
Say "=== FIM $(Get-Date -Format o) ==="

[IO.File]::WriteAllText($logPath, ($L -join "`r`n"), (New-Object System.Text.UTF8Encoding($false)))
Write-Host ""
Write-Host "log escrito em: $logPath"
Start-Sleep -Seconds 3
