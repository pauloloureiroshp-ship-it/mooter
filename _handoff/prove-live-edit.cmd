@echo off
setlocal
echo ==================================================
echo  Mooter eyeball 0.16.62 - Context Engine + data-hop
echo  (caminhos corrigidos - repo root = frugal-eyeball)
echo ==================================================
echo.
echo [1/5] A parar node (dev servers antigos)...
taskkill /IM node.exe /F >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/5] A arrancar o dev server em frugal-eyeball\landing (janela MooterEyeball)...
start "MooterEyeball" /D "C:\Users\Paulo Loureiro\frugal-eyeball\landing" cmd /k "npm run dev"
echo    Aguarda o dev server subir (~18s)...
timeout /t 18 /nobreak >nul

echo [3/5] A fechar o VS Code + remover versoes antigas do mooter...
taskkill /IM Code.exe /F >nul 2>&1
timeout /t 4 /nobreak >nul
for /d %%D in ("%USERPROFILE%\.vscode\extensions\mooter.mooter-cockpit-*") do rmdir /s /q "%%D"
del /q "%USERPROFILE%\.vscode\extensions\.obsolete" >nul 2>&1

echo [4/5] A instalar mooter-cockpit-0.16.62.vsix...
where code >nul 2>&1
if errorlevel 1 set "PATH=%LOCALAPPDATA%\Programs\Microsoft VS Code\bin;C:\Program Files\Microsoft VS Code\bin;%PATH%"
call code --install-extension "C:\Users\Paulo Loureiro\frugal-eyeball\packages\vscode-extension\mooter-cockpit-0.16.62.vsix" --force
if errorlevel 1 (
  echo ERRO na instalacao. Cola este ecra no Cowork.
  pause
  exit /b 1
)

echo [5/5] A reabrir o VS Code em frugal-eyeball (a arvore servida - o gate abre)...
start "" code "C:\Users\Paulo Loureiro\frugal-eyeball"

echo.
echo ==================================================
echo  FIM. Dev server na janela "MooterEyeball".
echo  No VS Code: Trust (Yes) - Live Preview - target 7819 - pin no savings - Perguntar.
echo ==================================================
pause
