# start-loop.ps1 — arranque limpo single-writer do loop SDK do Mooter (Windows).
# Uso:  duplo-clique em _handoff/loop/start-mooter-loop.bat  (ou corre este .ps1)
# Faz: instala SDK+pm2 -> mata órfãos -> copia runner -> smoke DRY_RUN (bus temp) -> pm2 24/7.

$ErrorActionPreference = "Continue"
$repo = (Resolve-Path "$PSScriptRoot\..\..\..\..").Path   # -> ~/frugal
Set-Location $repo
Write-Host "repo = $repo"

# 1) SDK (auth = crédito do plano Max, SEM API key)
if (-not (Test-Path "node_modules/@anthropic-ai/claude-agent-sdk")) {
  Write-Host "A instalar @anthropic-ai/claude-agent-sdk..."
  npm i @anthropic-ai/claude-agent-sdk
}
# 1.5) pm2 global, se faltar
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  Write-Host "A instalar pm2 global..."
  npm i -g pm2
}

# 2) single-writer: mata órfãos node + limpa pm2 (evita colisão de escritores)
Write-Host "A garantir um so escritor (fecha sessoes node em curso)..."
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
pm2 delete all 2>$null | Out-Null

# 3) copiar o runner para o bus, se preciso
$dst = "_handoff/loop/sdk-runner.mjs"
if (-not (Test-Path $dst)) { Copy-Item "$PSScriptRoot/sdk-runner.mjs" $dst }

# 4) smoke em DRY_RUN num BUS TEMPORARIO (nao toca no bus real)
Write-Host "Smoke DRY_RUN (bus temporario)..."
$tmp = Join-Path $env:TEMP "mooter-smoke"
New-Item -ItemType Directory -Force -Path "$tmp\transcript" | Out-Null
'{"status":"cc_running","round":1,"maxRounds":1,"sessionId":null}' | Set-Content "$tmp\STATE.json"
"smoke" | Set-Content "$tmp\INBOX.md"
$