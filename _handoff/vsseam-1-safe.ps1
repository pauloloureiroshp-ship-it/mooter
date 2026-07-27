# VSSEAM-1 SAFE — resgate do commit orfao + ollama list + snapshot (zero risco, reversivel)
$log = Join-Path $PSScriptRoot "vsseam-1-safe.log"
$repo = "C:\Users\Paulo Loureiro\frugal"
"=== VSSEAM-1 SAFE $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii

"--- [1/3] resgate: git branch feat/ledger-receipts 101ddee ---" | Out-File $log -Append -Encoding ascii
git -C $repo branch feat/ledger-receipts 101ddee913f0956b953df7edf905723916147d53 2>&1 | Out-File $log -Append -Encoding ascii
git -C $repo branch --list "feat/ledger-receipts" -v 2>&1 | Out-File $log -Append -Encoding ascii

"--- [2/3] ollama list (destrava Mesh B) ---" | Out-File $log -Append -Encoding ascii
ollama list 2>&1 | Out-File $log -Append -Encoding ascii

"--- [3/3] snapshot de branches relevantes ---" | Out-File $log -Append -Encoding ascii
git -C $repo branch --list "feat/vs-w1-semaforo" "feat/mesh-phase-a" "feat/vs-seam-w0-w2" "feat/ledger-receipts" -v 2>&1 | Out-File $log -Append -Encoding ascii
"DONE. Log: vsseam-1-safe.log — o Cowork le este log na proxima interacao." | Out-File $log -Append -Encoding ascii
Write-Host "VSSEAM-1 concluido. Veja vsseam-1-safe.log"
