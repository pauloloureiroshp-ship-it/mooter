@echo off
chcp 65001 >nul
cd /d "C:\Users\Paulo Loureiro\frugal"
echo.
echo == 1/3 arrancar o dev server do landing numa janela propria (porta 7819) ==
echo    fecha essa janela quando quiseres parar o servidor.
start "mooter dev server - landing 7819" /D "C:\Users\Paulo Loureiro\frugal\landing" cmd /k npm run dev
echo    a dar 30s ao Next para arrancar...
timeout /t 30 /nobreak >nul
echo.
echo == 2/3 gerar dist\cockpit-snapshot.html ==
node "C:\Users\Paulo Loureiro\frugal\tools\cockpit\build-snapshot.js"
echo.
echo == 3/3 veredicto do live preview ==
node "C:\Users\Paulo Loureiro\frugal\tools\cockpit\lp-veredicto.js"
echo.
pause
