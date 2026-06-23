@echo off
echo ============================================================
echo  Reparar git do repo (SEGURO: commits e ficheiros INTACTOS)
echo  - reconstroi o indice corrompido a partir do HEAD
echo  - remove worktrees mortos (prune)
echo ============================================================
cd /d "%USERPROFILE%\frugal"
echo.
echo [1/3] A remover indice corrompido...
if exist ".git\index" del ".git\index"
echo [2/3] A reconstruir indice a partir do HEAD (git reset, sem perder ficheiros)...
git reset
if errorlevel 1 (
  echo   git reset falhou; a tentar read-tree...
  git read-tree HEAD
)
echo [3/3] A podar worktrees mortos...
git worktree prune -v
echo.
echo --- estado final ---
git status -sb 2>&1 | more
echo.
echo === Feito. Fecha e reabre o VS Code ^(ou Ctrl+Shift+P ^> Reload Window^) e o cockpit volta. ===
pause
