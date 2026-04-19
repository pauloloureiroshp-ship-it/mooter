# mooter.ps1 -- brand launcher for Claude Code + multi-line dashboard combo.
#
# Calling `mooter` in ANY terminal on Windows:
#   1. Detects terminal environment (VS Code, Windows Terminal, PowerShell).
#   2. Launches mooter-dashboard.js in a NEW window so the layered multi-line
#      dashboard renders without Claude Code's 1-line statusline restriction.
#   3. Runs `claude` in the current terminal, forwarding args.
#
# Fallback order:
#   a) Windows Terminal session    -> wt split-pane, dashboard on the right.
#   b) wt available but not inside -> spawn wt new window with dashboard.
#   c) Plain PowerShell / VS Code  -> Start-Process a PS window with dashboard.
#
# ASCII-only source so Windows PowerShell 5.1 parses it without BOM.

param(
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$ClaudeArgs
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir       = Split-Path -Parent $MyInvocation.MyCommand.Path
$DashboardScript = Join-Path $ScriptDir 'mooter-dashboard.js'

Write-Host ''
Write-Host 'mooter -- launching Claude Code with live dashboard' -ForegroundColor Magenta
Write-Host ''

# Preconditions.
if (-not (Test-Path $DashboardScript)) {
    Write-Host ('[!] mooter-dashboard.js not found at ' + $DashboardScript) -ForegroundColor Yellow
    Write-Host 'Running plain claude (no dashboard).' -ForegroundColor Yellow
    & claude @ClaudeArgs
    return
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host '[!] node not found on PATH. Dashboard disabled.' -ForegroundColor Yellow
    & claude @ClaudeArgs
    return
}
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host '[X] claude CLI not found on PATH. Install Claude Code first.' -ForegroundColor Red
    return
}

# Strategy selection.
$wtCmd = Get-Command wt -ErrorAction SilentlyContinue
$inWT  = [bool]$env:WT_SESSION

if ($inWT) {
    Write-Host 'Detected Windows Terminal session -- splitting pane.' -ForegroundColor DarkGray
    $wtArgs = @('-w', '0', 'sp', '-V', '--size', '0.33', '--title', 'mooter-dashboard', 'node', $DashboardScript)
    Start-Process -FilePath 'wt' -ArgumentList $wtArgs -WindowStyle Hidden | Out-Null
    Start-Sleep -Milliseconds 400
    & claude @ClaudeArgs
}
elseif ($wtCmd) {
    Write-Host 'Opening Windows Terminal window with dashboard pane...' -ForegroundColor DarkGray
    $wtArgs = @('-w', 'new', '--title', 'mooter-dashboard', 'node', $DashboardScript)
    Start-Process -FilePath 'wt' -ArgumentList $wtArgs -WindowStyle Normal | Out-Null
    Start-Sleep -Milliseconds 500
    & claude @ClaudeArgs
}
else {
    Write-Host 'Windows Terminal not found -- opening dashboard in a new PowerShell window.' -ForegroundColor DarkGray
    $psArgs = @('-NoExit', '-Command', ('node "' + $DashboardScript + '"'))
    Start-Process -FilePath 'powershell' -ArgumentList $psArgs -WindowStyle Normal | Out-Null
    Start-Sleep -Milliseconds 500
    & claude @ClaudeArgs
}
