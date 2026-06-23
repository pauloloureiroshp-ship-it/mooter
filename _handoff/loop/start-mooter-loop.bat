@echo off
REM Lançador de um-clique do loop SDK do Mooter. Duplo-clique para arrancar.
REM Corre start-loop.ps1: npm i SDK -> single-writer -> smoke DRY_RUN -> pm2 24/7.
cd /d "%USERPROFILE%\frugal"
powershell -ExecutionPolicy Bypass -File "%USERPROFILE%\frugal\_handoff\skills-build\cowork-cc-bridge\scripts\start-loop.ps1"
echo.
echo === Loop arrancado. Board: pm2 logs mooter-sdk-loop ===
pause
