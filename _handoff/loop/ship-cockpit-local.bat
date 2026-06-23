@echo off
setlocal enabledelayedexpansion
cd /d "%USERPROFILE%\frugal\packages\vscode-extension"
echo ============================================================
echo  Mooter cockpit -> instalar local (working tree v4, sem git/remoto)
echo ============================================================
where vsce >nul 2>nul
if errorlevel 1 (
  echo [1/3] A instalar @vscode/vsce ...
  call npm i -g @vscode/vsce
)
echo [2/3] A empacotar a extensao ...
call vsce package
if errorlevel 1 (
  echo ERRO no vsce package. Ve os avisos acima ^(provavel: repo/license/README^). Nada foi instalado.
  goto :end
)
set "VSIX="
for /f "delims=" %%f in ('dir /b /o-d *.vsix 2^>nul') do ( set "VSIX=%%f" & goto :got )
:got
if "!VSIX!"=="" ( echo ERRO: nenhum .vsix gerado. & goto :end )
echo [3/3] A instalar !VSIX! no VS Code ...
call code --install-extension "!VSIX!" --force
if errorlevel 1 (
  echo ERRO: comando 'code' nao esta no PATH. Em VS Code: Ctrl+Shift+P ^> "Shell Command: Install 'code' command in PATH", e corre de novo.
  goto :end
)
echo.
echo === OK: !VSIX! instalado. Recarrega a janela do VS Code para veres o cockpit novo. ===
:end
echo.
pause
