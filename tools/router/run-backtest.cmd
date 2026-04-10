@echo off
REM frugal daily backtest + optional delta export (v0.9.4)
REM Uses %~dp0 to resolve paths relative to this script — safe with spaces.
set "SCRIPT_DIR=%~dp0"
set "NODE=node"
where node >nul 2>&1 || set "NODE=C:\Program Files\nodejs\node.exe"

"%NODE%" "%SCRIPT_DIR%backtest.js" > "%SCRIPT_DIR%backtest-latest.log" 2>&1
"%NODE%" "%SCRIPT_DIR%backtest.js" --export-delta --output "%SCRIPT_DIR%backtest-delta.json" >> "%SCRIPT_DIR%backtest-latest.log" 2>&1
