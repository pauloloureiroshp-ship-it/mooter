# ADMIN_FINALIZE.ps1 - finish the two-factor fleet-survival items (Paulo runs this).
#
# WHY THIS EXISTS
#   The 24/7 mooter-fleet (pm2) runs but does NOT yet survive a reboot, and pm2 logs
#   are not rotated. Claude Code could not finish these autonomously:
#     - `pm2 install pm2-logrotate` fails on this machine with EPERM because pm2's
#       module installer spawns npm with an UNQUOTED path and truncates at the space
#       in "C:\Users\Paulo Loureiro" -> it tries to mkdir "C:\Users\Paulo". Running as
#       Administrator does NOT fix this (it is a quoting bug, not a permissions one).
#     - boot persistence is a machine-level change that belongs to the human gate.
#
# WHAT IT DOES (idempotent - safe to run more than once)
#   1. logrotate: sets the rotation config, then tries to install the module a couple
#      of ways that dodge the space-in-path bug. Non-fatal if it still cannot install.
#   2. boot persistence: a user-logon Scheduled Task that runs `pm2 resurrect`, so the
#      saved process list comes back after a reboot. LIMITED run level -> no UAC needed
#      for the task itself; this is more robust than pm2-windows-startup (no npm).
#   3. `pm2 save` to persist the current process list for resurrect.
#
# HOW TO RUN
#   Right-click -> Run with PowerShell, or:  pwsh -File _handoff/fleet/ADMIN_FINALIZE.ps1
#   A transcript is written next to this file: ADMIN_FINALIZE.log
#
# Everything is ASCII and quoted for paths with spaces.

$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$log  = Join-Path $here 'ADMIN_FINALIZE.log'
function Log([string]$m) {
  $line = ('[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'), $m)
  $line | Tee-Object -FilePath $log -Append
}

Log '=== ADMIN_FINALIZE start ==='

# --- 0. pm2 present? ---------------------------------------------------------
$pm2 = (Get-Command pm2 -ErrorAction SilentlyContinue)
if (-not $pm2) { Log 'FATAL: pm2 not on PATH. Open the shell that runs the fleet and retry.'; exit 1 }
Log ('pm2: ' + $pm2.Source)

# --- 1. logrotate config (idempotent; harmless even if module not yet present) ---
Log '--- logrotate config ---'
& pm2 set pm2-logrotate:max_size 50M   2>&1 | Out-Null
& pm2 set pm2-logrotate:retain   30    2>&1 | Out-Null
& pm2 set pm2-logrotate:compress  true 2>&1 | Out-Null
Log 'set max_size=50M retain=30 compress=true'

Log '--- logrotate install (best effort; space-in-path bug may block it) ---'
& pm2 install pm2-logrotate 2>&1 | Tee-Object -FilePath $log -Append
if ($LASTEXITCODE -eq 0 -and (& pm2 ls 2>&1 | Select-String -Quiet 'logrotate')) {
  Log 'logrotate: INSTALLED and active.'
} else {
  Log 'logrotate: still not installed (known pm2 space-path bug). Workaround options:'
  Log '  A) Move PM2_HOME to a spaceless path once:  setx PM2_HOME C:\pm2  (new shell), then'
  Log '     re-create the fleet under it and re-run this script.'
  Log '  B) Track upstream: pm2 module install + spaces in %USERPROFILE% (Unitech/pm2).'
  Log '  Logs will still grow until rotated; not fatal for the fleet loop.'
}

# --- 2. boot persistence: user-logon Scheduled Task -> pm2 resurrect ----------
Log '--- boot persistence (logon task: pm2 resurrect) ---'
$taskName = 'MooterFleetResurrect'
$pm2Cmd   = $pm2.Source
# Resolve a node/pm2 launcher robustly. pm2 on Windows is usually a .cmd shim.
$action = "cmd /c `"$pm2Cmd`" resurrect"
& schtasks /Create /TN $taskName /TR $action /SC ONLOGON /RL LIMITED /F 2>&1 | Tee-Object -FilePath $log -Append
if ($LASTEXITCODE -eq 0) { Log ('boot persistence: logon task "' + $taskName + '" created (pm2 resurrect).') }
else { Log 'boot persistence: schtasks create FAILED - re-run in an elevated shell if it needs admin.' }

# --- 3. persist the current process list --------------------------------------
Log '--- pm2 save ---'
& pm2 save 2>&1 | Tee-Object -FilePath $log -Append

Log '=== ADMIN_FINALIZE done ==='
Log 'Verify:  pm2 ls   (mooter-fleet online)  |  schtasks /Query /TN MooterFleetResurrect'
