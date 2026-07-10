@echo off
REM run-watchdog.cmd — schtasks entrypoint for the external fleet watchdog (F4).
REM FLICKER FIX 2026-07-10: schedule the task via the INVISIBLE wrapper, never
REM this .cmd directly (a .cmd under schtasks opens a console window every 5min):
REM   schtasks /Create /SC MINUTE /MO 5 /TN MooterFleetWatchdog ^
REM     /TR "wscript.exe \"C:\Users\Paulo Loureiro\frugal-fleet-arm\_handoff\fleet\run-watchdog-hidden.vbs\""
cd /d "C:\Users\Paulo Loureiro\frugal-fleet-arm"
node _handoff\fleet\fleet-watchdog.mjs >> "%TEMP%\mooter-watchdog.log" 2>&1
