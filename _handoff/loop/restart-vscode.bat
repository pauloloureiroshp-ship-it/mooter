@echo off
echo === Arranque limpo do VS Code ===
echo [1/2] A fechar o VS Code por completo...
taskkill /F /IM Code.exe 2>nul
timeout /t 4 >nul
echo [2/2] A reabrir o frugal num processo novo...
code "%USERPROFILE%\frugal"
timeout /t 2 >nul
