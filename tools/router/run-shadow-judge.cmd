@echo off
REM Shadow judge nightly — scheduled via Task Scheduler at 03:00.
REM Creates: schtasks /create /tn "FrugalShadowJudge" /tr "C:\Users\Paulo Loureiro\frugal\tools\router\run-shadow-judge.cmd" /sc daily /st 03:00

cd /d "%USERPROFILE%\.claude\tools\router"
node "%USERPROFILE%\frugal\tools\router\shadow-judge.js" --limit 200 >> "%USERPROFILE%\.claude\tools\router\shadow-judge.log" 2>&1
