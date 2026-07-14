@echo off
setlocal
echo ============================================
echo  Mooter 0.16.59 - reinstalacao limpa (workspace frugal-lp49)
echo ============================================
echo.
echo [1/6] A fechar o VS Code (as sessoes CC fecham; trabalho esta pushed)...
taskkill /IM Code.exe /F >nul 2>&1
timeout /t 4 /nobreak >nul

echo [2/6] A remover versoes antigas do mooter (evita conflito de versoes)...
for /d %%D in ("%USERPROFILE%\.vscode\extensions\mooter.mooter-cockpit-*") do rmdir /s /q "%%D"
del /q "%USERPROFILE%\.vscode\extensions\.obsolete" >nul 2>&1

echo [3/6] A localizar o CLI do VS Code...
where code >nul 2>&1
if errorlevel 1 set "PATH=%LOCALAPPDATA%\Programs\Microsoft VS Code\bin;C:\Program Files\Microsoft VS Code\bin;%PATH%"
where code >nul 2>&1
if errorlevel 1 (
  echo ERRO: nao encontrei o comando "code". Instala manualmente via UI.
  pause
  exit /b 1
)

echo [4/6] A instalar mooter-cockpit-0.16.59.vsix...
call code --install-extension "C:\Users\Paulo Loureiro\frugal-land-mp52a\packages\vscode-extension\mooter-cockpit-0.16.59.vsix" --force
if errorlevel 1 (
  echo ERRO na instalacao. Nao continues; cola este ecra no Cowork.
  pause
  exit /b 1
)

echo.
echo [5/6] Verificacao com o motor real instalado:
node "C:\Users\Paulo Loureiro\frugal\_handoff\repro-live-edit.js"

echo.
echo [6/6] A reabrir o VS Code na pasta frugal-lp49 (a arvore servida - gate abre)...
start "" code "C:\Users\Paulo Loureiro\frugal-lp49"

echo.
echo ============================================
echo  FIM. Confirma acima: SO uma extensao 0.16.55 / embarcado true / ok:true
echo  Esta janela fica aberta para leitura.
echo ============================================
pause
