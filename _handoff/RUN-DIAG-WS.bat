@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Paulo Loureiro\frugal\_handoff\diag-ws.ps1"
exit /b %ERRORLEVEL%
