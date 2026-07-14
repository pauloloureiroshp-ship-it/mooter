@echo off
setlocal
rem Wrapper script-first: roda AtivarCodexVSCode.ps1 com o projeto frugal,
rem sem dialogo de pasta, com log auditavel ao lado (scripts\). Nao mexe no TEMP.
set "SCRIPT=%~dp0AtivarCodexVSCode.ps1"
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "RUNLOG=%~dp0ativar-codex-vscode.run.log"

if not exist "%SCRIPT%" (
    echo AtivarCodexVSCode.ps1 nao encontrado ao lado deste wrapper. >> "%RUNLOG%"
    exit /b 1
)

echo ===== run %date% %time% ===== >> "%RUNLOG%"
"%PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -STA -File "%SCRIPT%" "C:\Users\Paulo Loureiro\frugal" >> "%RUNLOG%" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"
echo exit_code=%EXIT_CODE% >> "%RUNLOG%"
exit /b %EXIT_CODE%
