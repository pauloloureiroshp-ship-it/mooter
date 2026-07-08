@echo off
REM run-watchdog.cmd — schtasks entrypoint for the external fleet watchdog (F4).
REM Installed by: schtasks /Create /SC MINUTE /MO 5 /TN MooterFleetWatchdog /TR <this>
cd /d "C:\Users\Paulo Loureiro\frugal-fleet-arm"
node _handoff\fleet\fleet-watchdog.mjs >> "%TEMP%\mooter-watchdog.log" 2>&1
