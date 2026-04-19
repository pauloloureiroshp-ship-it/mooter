@echo off
rem mooter.cmd — cmd.exe shim that forwards to mooter.ps1.
rem Lets `mooter` work in any Windows shell (cmd, PowerShell, Git Bash,
rem VS Code integrated terminal, Windows Terminal).
setlocal
set "MOOTER_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%MOOTER_DIR%mooter.ps1" %*
