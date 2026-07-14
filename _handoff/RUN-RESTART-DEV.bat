@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Paulo Loureiro\frugal\_handoff\restart-devserver.ps1"
exit /b %ERRORLEVEL%
