$ErrorActionPreference = 'Stop'

$repoPath = 'C:\Users\Paulo Loureiro\frugal'
Set-Location -Path $repoPath

Write-Host "Este script faz limpeza em 3 passos independentes, cada um com a sua propria confirmacao:"
Write-Host "  A. Apagar _handoff\*.mcpb excepto o mais recente"
Write-Host "  B. Remover a worktree frugal-super-auditoria e o branch mooter/wt-super-auditoria"
Write-Host "  C. Gerar um novo bundle .mcpb com pack-mcpb.mjs"
Write-Host ""

# --- Passo A ---
Write-Host "--- Passo A: ficheiros .mcpb em _handoff ---"
$mcpbFiles = Get-ChildItem -Path "_handoff" -Filter "*.mcpb" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending

if (-not $mcpbFiles -or $mcpbFiles.Count -eq 0) {
    Write-Host "Nenhum ficheiro .mcpb encontrado em _handoff. A saltar passo A."
} else {
    $totalBytes = ($mcpbFiles | Measure-Object -Property Length -Sum).Sum
    $totalMB = [Math]::Round($totalBytes / 1MB, 2)
    $countFiles = $mcpbFiles.Count

    foreach ($f in $mcpbFiles) {
        $sizeMB = [Math]::Round($f.Length / 1MB, 2)
        Write-Host ("  {0}  {1}  {2} MB" -f $f.LastWriteTime, $f.Name, $sizeMB)
    }
    Write-Host ""
    Write-Host ("Total: {0} ficheiros, {1} MB." -f $countFiles, $totalMB)
    Write-Host ("O mais recente e: {0}" -f $mcpbFiles[0].Name)
    Write-Host ""

    if ($countFiles -le 1) {
        Write-Host "So ha 1 ficheiro (ou 0), nada para apagar. A saltar passo A."
    } else {
        $toDeleteCount = $countFiles - 1
        $answerA = Read-Host "Apagar TODOS excepto o mais recente ($toDeleteCount ficheiros)? Responde exactamente S para confirmar"
        if ($answerA -ceq 'S') {
            $toDelete = $mcpbFiles | Select-Object -Skip 1
            foreach ($f in $toDelete) {
                Write-Host "A apagar: $($f.FullName)"
                Remove-Item -Path $f.FullName -Force
            }
            Write-Host "Passo A concluido."
        } else {
            Write-Host "Passo A: nada apagado (resposta nao foi S)."
        }
    }
}
Write-Host ""

# --- Passo B ---
Write-Host "--- Passo B: worktree frugal-super-auditoria ---"
$worktreePath = 'C:\Users\Paulo Loureiro\frugal-super-auditoria'
$branchName = 'mooter/wt-super-auditoria'
Write-Host "Esta worktree e branch foram criados por uma sessao de auditoria de 2026-07-27."
Write-Host "Worktree: $worktreePath"
Write-Host "Branch: $branchName"
$answerB = Read-Host "Remover a worktree (git worktree remove) e apagar o branch (git branch -D)? Responde exactamente S para confirmar"
if ($answerB -ceq 'S') {
    Write-Host "A remover worktree..."
    git worktree remove "$worktreePath"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "git worktree remove falhou (exit code $LASTEXITCODE). Branch NAO apagado."
    } else {
        Write-Host "A apagar branch..."
        git branch -D $branchName
        Write-Host "Passo B concluido."
    }
} else {
    Write-Host "Passo B: nada removido (resposta nao foi S)."
}
Write-Host ""

# --- Passo C ---
Write-Host "--- Passo C: gerar bundle .mcpb da 1.24.1 ---"
Write-Host "Isto ESCREVE um novo ficheiro .mcpb em _handoff/. A instalacao desse bundle e manual."
$answerC = Read-Host "Correr node packages/mooter-bridge/pack-mcpb.mjs? Responde exactamente S para confirmar"
if ($answerC -ceq 'S') {
    node packages/mooter-bridge/pack-mcpb.mjs
    Write-Host "Passo C concluido."
} else {
    Write-Host "Passo C: nada corrido (resposta nao foi S)."
}
Write-Host ""

Write-Host "Limpeza terminada."
