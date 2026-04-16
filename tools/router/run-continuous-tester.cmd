@echo off
REM Mooter Continuous Tester — runs 24/7 in a dedicated terminal.
REM Usage: double-click or run from terminal.
REM Press Ctrl+C to stop gracefully.

title Mooter Continuous Tester - 24/7

set "SCRIPT_DIR=%~dp0"
set "NODE=node"
where node >nul 2>&1 || set "NODE=C:\Program Files\nodejs\node.exe"

echo.
echo Starting Mooter Continuous Tester...
echo Logs: %SCRIPT_DIR%mooter-tester-stats.json
echo History: %USERPROFILE%\.claude\tools\router\mooter-tester-history.jsonl
echo.

"%NODE%" "%SCRIPT_DIR%mooter-continuous-tester.js" %*

pause
