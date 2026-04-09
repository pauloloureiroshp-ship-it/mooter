@echo off
REM frugal daily backtest + optional delta export (v0.9)
REM - Always runs the core backtest → router-tuning.json
REM - If FRUGAL_HUB_URL is set, also exports an anonymized delta that the
REM   hub POST step (future v1.1) will consume. For now the delta is just
REM   written locally to backtest-delta.json for manual sharing.
"C:\Program Files\nodejs\node.exe" "C:\Users\Paulo Loureiro\.claude\tools\router\backtest.js" > "C:\Users\Paulo Loureiro\.claude\tools\router\backtest-latest.log" 2>&1
"C:\Program Files\nodejs\node.exe" "C:\Users\Paulo Loureiro\.claude\tools\router\backtest.js" --export-delta --output "C:\Users\Paulo Loureiro\.claude\tools\router\backtest-delta.json" >> "C:\Users\Paulo Loureiro\.claude\tools\router\backtest-latest.log" 2>&1
