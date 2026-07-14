@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-gemini-vscode.ps1"
exit /b %ERRORLEVEL%
