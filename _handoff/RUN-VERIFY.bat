@echo off
title Mooter - verificar merge LP-4.8 (2026-07-07)
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Paulo Loureiro\frugal\_handoff\verify-lp48-merge.ps1"
echo.
echo Concluido. Log: _handoff\verify-log.txt
pause
