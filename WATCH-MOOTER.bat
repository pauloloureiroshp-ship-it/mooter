@echo off
title Mooter - gerador de progresso
cd /d "C:\Users\Paulo Loureiro\frugal\_handoff"
echo A gerar o progresso de 5 em 5 segundos.
echo Abre progresso.html no browser - actualiza-se sozinho.
echo Fecha esta janela para parar.
node progresso.js
start "" "C:\Users\Paulo Loureiro\frugal\_handoff\progresso.html"
:loop
timeout /t 5 /nobreak > nul
node progresso.js > nul 2>&1
goto loop
