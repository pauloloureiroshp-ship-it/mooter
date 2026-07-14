@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Paulo Loureiro\frugal\_handoff\serve-w2.ps1"
exit /b %ERRORLEVEL%
