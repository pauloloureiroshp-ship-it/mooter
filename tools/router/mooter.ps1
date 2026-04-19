# mooter.ps1 — brand launcher for Claude Code + multi-line dashboard combo.
#
# Calling `mooter` in ANY terminal on Windows:
#   1. Detects terminal environment (VS Code, Windows Terminal, PowerShell, cmd).
#   2. Launches the mooter-dashboard.js companion in a NEW window so the
#      multi-line layered dashboard renders without Claude Code's 1-line
#      restriction.
#   3. Runs `claude` in the current terminal with the original args passed
#      through.
#
# Fallback order:
#   a) Windows Terminal available      → wt new window, 2 panes (dashboard + claude).
#   b) Otherwise (VS Code, plain PS)   → Start-Process a separate PowerShell
#      window for the dashboard, then claude runs where the user is.

param(
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$ClaudeArgs
)

$ErrorActionPreference = 'Continue'

# Resolve paths off this script's location so it works wherever the repo lives.
$ScriptDir       = Split-Path -Parent $MyInvocation.MyCommand.Path
$DashboardScript = Join-Path $ScriptDir 'mooter-dashboard.js'
$StatuslineScript = Join-Path $ScriptDir 'gsd-statusline.js'

function Write-Brand {
    param([string]$Line, [string]$Color = 'Magenta')
    Write-Host $Line -ForegroundColor $Color
}

Write-Host ''
Write-Brand '🐮 mooter — launching Claude Code with live dashboard' 'Magenta'
Write-Host ''

# Preconditions
if (-not (Test-Path $DashboardScript)) {
    Write-Host "⚠ mooter-dashboard.js not found at $DashboardScript" -ForegroundColor Yellow
    Write-Host 'Running plain claude (no dashboard).' -ForegroundColor Yellow
    & claude @ClaudeArgs
    return
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host '⚠ node not found on PATH. Dashboard disabled.' -ForegroundColor Yellow
    & claude @ClaudeArgs
    return
}
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host '⚠ claude CLI not found on PATH. Install Claude Code first.' -ForegroundColor Red
    return
}

# Strategy selection
$wtCmd = Get-Command wt -ErrorAction SilentlyContinue
$inWT  = [bool]$env:WT_SESSION

if ($inWT) {
    # We're already running inside Windows Terminal — split the current
    # pane vertically and put the dashboard on the right (33% width).
    Write-Host 'Detected Windows Terminal session — splitting pane.' -ForegroundColor DarkGray
    $wtArgs = @('-w', '0', 'sp', '-V', '--size', '0.33', '--title', 'mooter-dashboard', 'node', $DashboardScript)
    Start-Process -FilePath 'wt' -ArgumentList $wtArgs -WindowStyle Hidden | Out-Null
    Start-Sleep -Milliseconds 400
    & claude @ClaudeArgs
}
elseif ($wtCmd) {
    # Windows Terminal available but we're elsewhere (VS Code terminal,
    # classic PS, etc.). Spawn WT in a fresh window with the dashboard
    # and run claude here.
    Write-Host 'Opening Windows Terminal window with dashboard pane…' -ForegroundColor DarkGray
    $wtArgs = @('-w', 'new', '--title', 'mooter-dashboard', 'node', $DashboardScript)
    Start-Process -FilePath 'wt' -ArgumentList $wtArgs -WindowStyle Normal | Out-Null
    Start-Sleep -Milliseconds 500
    & claude @ClaudeArgs
}
else {
    # No Windows Terminal — fall back to a plain PowerShell window.
    Write-Host 'Windows Terminal not found — opening dashboard in a new PowerShell window.' -ForegroundColor DarkGray
    $psArgs = @('-NoExit', '-Command', "node `"$DashboardScript`"")
    Start-Process -FilePath 'powershell' -ArgumentList $psArgs -WindowStyle Normal | Out-Null
    Start-Sleep -Milliseconds 500
    & claude @ClaudeArgs
}
