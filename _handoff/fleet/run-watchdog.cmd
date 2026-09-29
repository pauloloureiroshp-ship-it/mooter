@echo off
REM run-watchdog.cmd — schtasks entrypoint for the external fleet watchdog (F4).
REM FLICKER FIX 2026-07-10: schedule the task via the INVISIBLE wrapper, never
REM this .cmd directly (a .cmd under schtasks opens a console window every 5min):
REM   schtasks /Create /SC MINUTE /MO 5 /TN MooterFleetWatchdog ^
REM     /TR "wscript.exe \"<REPO>\_handoff\fleet\run-watchdog-hidden.vbs\""
REM   (<REPO> = absolute path of the checkout; schtasks /TR needs it literal.)
REM %~dp0 = this script's dir (<REPO>\_handoff\fleet\) — ..\.. is the repo root,
REM so the watchdog follows the checkout instead of a hardcoded worktree.
cd /d "%~dp0..\.."
node _handoff\fleet\fleet-watchdog.mjs >> "%TEMP%\mooter-watchdog.log" 2>&1
