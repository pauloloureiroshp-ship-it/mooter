@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Paulo Loureiro\frugal\_handoff\check-w2-line.ps1"
exit /b %ERRORLEVEL%
