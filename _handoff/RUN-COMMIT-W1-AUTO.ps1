$ErrorActionPreference = 'Stop'

$repoPath = 'C:\Users\Paulo Loureiro\frugal'
$files = @(
  '.gitignore',
  'packages/mooter-bridge/sync.js',
  'packages/mooter-bridge/sync.test.js',
  'packages/mooter-bridge/package.json',
  'packages/mooter-bridge/worktrees.js',
  'packages/mooter-bridge/worktrees.test.js',
  'packages/mooter-bridge/fleet.js',
  'packages/mooter-bridge/fleet.test.js',
  'packages/mooter-bridge/manifest.json',
  'packages/mooter-bridge/entregas-por-versao.json'
)

Write-Host "Este script (modo automatico, sem Read-Host) vai:"
Write-Host "  1. Mostrar git status --porcelain dos 10 ficheiros abaixo."
Write-Host "  2. Assumir S e dar git add SELECTIVO apenas a esses 10 ficheiros."
Write-Host "  3. Assumir S e remover do indice os 6 RUN-*.bat com git rm --cached."
Write-Host "  4. Correr node --test em packages/mooter-bridge. Se falhar, aborta sem commitar."
Write-Host "  5. Se os testes passarem, fazer git commit -F com a mensagem preparada."
Write-Host "  6. NAO faz push."
Write-Host ""
Write-Host "Ficheiros:"
foreach ($f in $files) { Write-Host "  $f" }
Write-Host ""

Set-Location -Path $repoPath

Write-Host "git status --porcelain (apenas os ficheiros acima):"
foreach ($f in $files) {
    $status = git status --porcelain -- "$f"
    if ($status) {
        Write-Host $status
    } else {
        Write-Host "  (sem alteracoes) $f"
    }
}
Write-Host ""

Write-Host "Continuar com git add + node --test + commit destes ficheiros? Responde exactamente S para confirmar"
Write-Host "-> S (automatico)"

Write-Host ""
Write-Host "Ha 6 ficheiros RUN-*.bat ja versionados que o novo .gitignore passa a ignorar. Para ficar coerente (nenhum .bat versionado), quero remove-los do indice com git rm --cached. Isto NAO apaga os ficheiros do disco. Continuar? (S/N)"
Write-Host "-> S (automatico)"
Write-Host "A remover RUN-*.bat do indice..."
git rm --cached RUN-COMMIT-ETA1.bat RUN-COMMIT-ETA2.bat RUN-COMMIT-ONDA1.bat RUN-LIMPAR.bat RUN-SONDA-MCP.bat RUN-TRAZER-SYNC.bat
Write-Host ""

Write-Host "A fazer git add selectivo..."
foreach ($f in $files) {
    git add -- "$f"
}

Write-Host ""
Write-Host "A correr node --test em packages/mooter-bridge..."
Push-Location "packages\mooter-bridge"
node --test
$testExitCode = $LASTEXITCODE
Pop-Location

if ($testExitCode -ne 0) {
    Write-Host ""
    Write-Host "ABORTADO: node --test falhou com exit code $testExitCode. Nao foi feito commit."
    exit 1
}

Write-Host "Testes OK (exit code 0)."
Write-Host ""

$commitMsgPath = Join-Path $env:TEMP "mooter-commit-msg-w1.txt"
$commitMsg = @'
fix(bridge): v1.24.1 - o --check deixa de ser auto-referencial e o npm test deixa de mentir

- sync.js semHead() mascara a linha HEAD so na comparacao do --check
- npm test passa de 1 para 29 ficheiros (297 testes)
- worktrees total alinhado com o criterio do firstFree, bruto exposto em total_bruto
- fleet.js espelha o mesmo filtro
- .gitignore cobre RUN-*.bat e pastas de agente
- manifest 1.24.1 com worktrees.js declarado
- RUN-*.bat sai do indice - passam a ser artefactos locais (.gitignore)
'@

[IO.File]::WriteAllText($commitMsgPath, $commitMsg, [Text.UTF8Encoding]::new($false))

Write-Host "A commitar..."
git commit -F "$commitMsgPath"

Write-Host ""
Write-Host "Commit feito. sem push - corre git push tu proprio se quiseres."
