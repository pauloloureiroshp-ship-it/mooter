# apply-desktop-config-mooter.ps1 — regista o mooter-bridge v0.2 no Claude Desktop (2026-07-24)
# Faz BACKUP timestampado do claude_desktop_config.json e MERGE (nunca substitui o resto).
# Depois: fechar e reabrir o Claude Desktop para as tools mcp aparecerem no Cowork.
$ErrorActionPreference = 'Stop'
$cfgPath = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"
$serverPath = "C:/Users/Paulo Loureiro/frugal/packages/mooter-bridge/server-seamless.js"

if (-not (Test-Path (Split-Path $cfgPath))) { New-Item -ItemType Directory -Path (Split-Path $cfgPath) -Force | Out-Null }

if (Test-Path $cfgPath) {
  $backup = "$cfgPath.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
  Copy-Item $cfgPath $backup
  Write-Host "Backup: $backup"
  $json = Get-Content $cfgPath -Raw | ConvertFrom-Json
} else {
  $json = [pscustomobject]@{}
}

if (-not ($json.PSObject.Properties.Name -contains 'mcpServers')) {
  $json | Add-Member -MemberType NoteProperty -Name mcpServers -Value ([pscustomobject]@{})
}
$entry = [pscustomobject]@{ command = 'node'; args = @($serverPath) }
if ($json.mcpServers.PSObject.Properties.Name -contains 'mooter') {
  $json.mcpServers.mooter = $entry
  Write-Host "Entrada 'mooter' atualizada."
} else {
  $json.mcpServers | Add-Member -MemberType NoteProperty -Name mooter -Value $entry
  Write-Host "Entrada 'mooter' adicionada."
}

$json | ConvertTo-Json -Depth 10 | Out-File $cfgPath -Encoding utf8
Write-Host "Config gravada em $cfgPath"
Write-Host "AGORA: fecha e reabre o Claude Desktop. As tools do mooter aparecem na sessao Cowork."
Start-Sleep -Seconds 4
