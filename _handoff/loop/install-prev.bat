@echo off
echo ============================================================
echo  REVERTER cockpit para v4 que funciona (0.16.2, sem git-stage)
echo ============================================================
set "VSIX=%USERPROFILE%\frugal\packages\vscode-extension\mooter-cockpit-0.16.2.vsix"
echo VSIX: %VSIX%
call code --install-extension "%VSIX%" --force
if errorlevel 1 (
  echo ERRO: 'code' CLI nao esta no PATH. Em VS Code: Extensions ^> "..." ^> "Install from VSIX..." ^> escolhe %VSIX%
) else (
  echo === OK revertido. Recarrega a janela do VS Code ^(Ctrl+Shift+P ^> Reload Window^). ===
)
pause
