# install-mooter.ps1 -- adds the mooter launcher to the user's PATH.
#
# Idempotent: re-running is safe. Does NOT require admin (user-scope env var).
# After install, open a NEW terminal window and run:  mooter
#
# ASCII-only source so Windows PowerShell 5.1 parses it without BOM issues.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ''
Write-Host 'mooter -- installer' -ForegroundColor Magenta
Write-Host ''

# Sanity check: required files must exist next to this installer.
$required = @('mooter.ps1', 'mooter.cmd', 'mooter-dashboard.js', 'gsd-statusline.js')
foreach ($f in $required) {
    $full = Join-Path $ScriptDir $f
    if (-not (Test-Path $full)) {
        Write-Host ('[X] missing: ' + $f) -ForegroundColor Red
        Write-Host ('    Expected at ' + $full) -ForegroundColor Red
        Write-Host '    Installer aborted.' -ForegroundColor Red
        exit 1
    }
    Write-Host ('  [OK] ' + $f) -ForegroundColor DarkGray
}

# PATH update (user scope, no admin needed).
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ([string]::IsNullOrEmpty($userPath)) { $userPath = '' }
$entries = $userPath -split ';' | Where-Object { $_ }

if ($entries -contains $ScriptDir) {
    Write-Host ''
    Write-Host ('  [OK] PATH already contains ' + $ScriptDir) -ForegroundColor Green
} else {
    if ($userPath.TrimEnd(';')) {
        $newPath = $userPath.TrimEnd(';') + ';' + $ScriptDir
    } else {
        $newPath = $ScriptDir
    }
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    Write-Host ''
    Write-Host ('  [OK] Added ' + $ScriptDir + ' to user PATH') -ForegroundColor Green
}

Write-Host ''
Write-Host 'mooter installed.' -ForegroundColor Green
Write-Host ''
Write-Host '  Next step: open a NEW terminal window (so PATH picks up) and run:' -ForegroundColor White
Write-Host ''
Write-Host '    mooter' -ForegroundColor Cyan
Write-Host ''
Write-Host '  This launches Claude Code + live multi-line dashboard pane.' -ForegroundColor DarkGray
Write-Host ''
