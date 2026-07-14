@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0diag-gemini-env.ps1"
exit /b %ERRORLEVEL%
