@echo off
echo ============================================================
echo  Instalar Mooter cockpit (v4 + git-stage + worktree)
echo ============================================================
set "VSIX=%USERPROFILE%\frugal\packages\vscode-extension\mooter-cockpit-0.16.4-full.vsix"
echo VSIX: %VSIX%
call code --install-extension "%VSIX%" --force
if errorlevel 1 (
  echo ERRO: 'code' CLI nao esta no PATH. Em VS Code: Ctrl+Shift+P ^> "Shell Command: Install 'code' command in PATH" e corre de novo.
  echo Alternativa: Extensions ^> "..." ^> "Install from VSIX..." ^> escolhe o ficheiro acima.
) else (
  echo === OK instalado. Recarrega a janela do VS Code para veres o cockpit completo. ===
)
pause
