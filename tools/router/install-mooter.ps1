# install-mooter.ps1 — adds the mooter launcher to the user's PATH.
#
# Idempotent: re-running is safe. Does NOT require admin (user-scope env var).
# After install, open a NEW terminal window and run:
#
#     mooter
#
# to launch Claude Code with the live multi-line dashboard pane.

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ''
Write-Host '🐮 mooter — installer' -ForegroundColor Magenta
Write-Host ''

# Sanity check
$required = @('mooter.ps1', 'mooter.cmd', 'mooter-dashboard.js', 'gsd-statusline.js')
foreach ($f in $required) {
    $full = Join-Path $ScriptDir $f
    if (-not (Test-Path $full)) {
        Write-Host "✗ missing: $f" -ForegroundColor Red
        Write-Host "  Expected at $full" -ForegroundColor Red
        Write-Host '  Installer aborted.' -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✓ $f" -ForegroundColor DarkGray
}

# PATH update (user scope — no admin needed)
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ([string]::IsNullOrEmpty($userPath)) { $userPath = '' }
$entries = $userPath -split ';' | Where-Object { $_ }

if ($entries -contains $ScriptDir) {
    Write-Host ''
    Write-Host "  ✓ PATH already contains $ScriptDir" -ForegroundColor Green
} else {
    $newPath = if ($userPath.TrimEnd(';')) { "$($userPath.TrimEnd(';'));$ScriptDir" } else { $ScriptDir }
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    Write-Host ''
    Write-Host "  ✓ Added $ScriptDir to user PATH" -ForegroundColor Green
}

Write-Host ''
Write-Host '✅ mooter installed.' -ForegroundColor Green
Write-Host ''
Write-Host '   Next step: open a NEW terminal (so PATH picks up) and run:' -ForegroundColor White
Write-Host ''
Write-Host '     mooter' -ForegroundColor Cyan
Write-Host ''
Write-Host '   This launches Claude Code + live multi-line dashboard in a new pane.' -ForegroundColor DarkGray
Write-Host ''
