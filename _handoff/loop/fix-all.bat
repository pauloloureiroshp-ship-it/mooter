@echo off
cd /d "%USERPROFILE%\frugal"
echo ================= MOOTER FIX-ALL =================
echo [1/4] A parar loop e processos node...
pm2 delete all 2>nul
taskkill /F /IM node.exe 2>nul
echo [2/4] A reparar o git (SEGURO: commits e ficheiros intactos)...
if exist ".git\index" del ".git\index"
git reset
git worktree prune -v
echo --- git status ---
git status -sb
echo [3/4] A instalar a extensao completa (v4 + estagio-git)...
call code --install-extension "%USERPROFILE%\frugal\packages\vscode-extension\mooter-cockpit-0.16.4-full.vsix" --force
echo [4/4] Feito. A Cowork vai fechar e reabrir o VS Code.
echo (podes fechar esta janela)
timeout /t 3 >nul
