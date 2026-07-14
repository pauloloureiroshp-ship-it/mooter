@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Paulo Loureiro\frugal\_handoff\serve-lp-coerencia.ps1"
exit /b %ERRORLEVEL%
