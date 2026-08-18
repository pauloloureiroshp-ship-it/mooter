@echo off
REM ============================================================================
REM  moo-runner.cmd — duplo-clique no Windows (RTX 4090) para pôr este device a
REM  trabalhar. Espelho fino do moo-runner.command do macOS.
REM
REM  Toda a lógica vive em tools\cockpit\runner\, com testes. Aqui não há
REM  comportamento — para que o que corre na máquina seja o que está no git.
REM
REM  A amostragem de GPU usa nvidia-smi (sem SDK, sem elevação). Se não existir,
REM  o painel mostra n/d com o motivo, nunca 0%.
REM ============================================================================
setlocal

set "REPO=%~dp0"
set "RUNNER=%REPO%tools\cockpit\runner\moo-runner.mjs"
set "ENDPOINT=%REPO%tools\cockpit\runner\f10-server.mjs"

where node >nul 2>nul
if errorlevel 1 (
  echo [moo-runner] node nao encontrado no PATH - fail-closed, nao arranca.
  exit /b 1
)
if not exist "%RUNNER%" (
  echo [moo-runner] %RUNNER% nao existe - o repo esta incompleto.
  exit /b 1
)

if not defined MOOTER_DEVICE set "MOOTER_DEVICE=%COMPUTERNAME%"

netstat -ano | findstr /R /C:"LISTENING.*:4290 " >nul 2>nul
if errorlevel 1 (
  start "" /b node "%ENDPOINT%"
  echo [moo-runner] endpoint F10 no ar em 127.0.0.1:4290.
) else (
  echo [moo-runner] endpoint F10 ja vivo na 4290.
)

REM Arranque automatico nunca levanta o STOP: o duplo-clique e o gesto do dono,
REM uma tarefa agendada nao e.
if "%MOOTER_AUTOSTART%"=="1" (
  echo [moo-runner] arranque automatico - nao levanto o STOP.
  node "%RUNNER%" %*
) else (
  node "%RUNNER%" --play %*
)
endlocal
