# preflight-spine-v2b.ps1 -- Verificador de "lousa limpa" (v2b: corrige colisoes PS5.1)
# Fix v2b: 'H' colidia com alias Get-History -> renomeado 'Sect'; 'Git' recursava
# (case-insensitive) -> renomeado 'RunGit' + git.exe explicito.
# ASCII-only. Read-only + seguro. Auditar pelo log (preflight-spine-v2b.log).

[CmdletBinding()]
param(
  [string]$RepoPath     = "C:\Users\Paulo Loureiro\frugal",
  [string]$ExpectedHead = "3825715",
  [string]$FrozenSha    = "427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f",
  [int]$WatchSeconds    = 20,
  [switch]$KillFrugalNode
)

$ErrorActionPreference = "Continue"
$log = Join-Path $PSScriptRoot "preflight-spine-v2b.log"
try { Start-Transcript -Path $log -Force | Out-Null } catch {}

$red = New-Object System.Collections.ArrayList
$warn = New-Object System.Collections.ArrayList
function Line($c,$t){ Write-Host $t -ForegroundColor $c }
function Sect($t){ Write-Host ""; Write-Host "== $t ==" -ForegroundColor Cyan }
function RunGit($a){ & git.exe -C $RepoPath @a 2>&1 }

Line White "SPINE V2 . PREFLIGHT v2b -- lousa limpa antes da sessao dona"
Line DarkGray ("Repo: {0} . HEAD esperado: {1} . watch: {2}s . {3}" -f $RepoPath,$ExpectedHead,$WatchSeconds,(Get-Date -Format s))

if (-not (Test-Path $RepoPath))                    { Line Red "ABORT: repo nao existe"; try{Stop-Transcript|Out-Null}catch{}; exit 2 }
if (-not (Test-Path (Join-Path $RepoPath ".git"))) { Line Red "ABORT: sem .git"; try{Stop-Transcript|Out-Null}catch{}; exit 2 }
$gitDir = Join-Path $RepoPath ".git"

# --- 1) processos ------------------------------------------------------------
Sect "1. Processos node/code/git a tocar o repo"
$suspects = @()
try {
  $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='code.exe' OR Name='git.exe'" -ErrorAction Stop
  foreach ($p in $procs) {
    $cl = [string]$p.CommandLine
    if ($cl -match "frugal") {
      $mainRepo = ($cl -match "frugal\\\.git|frugal\\_handoff|frugal\\tools|frugal\\packages") -and ($cl -notmatch "frugal-")
      $suspects += [pscustomobject]@{
        PID=$p.ProcessId; Name=$p.Name; MainRepo=$mainRepo;
        Cmd=($cl.Substring(0,[Math]::Min(110,$cl.Length)))
      }
    }
  }
} catch { Line Yellow "  (Win32_Process indisponivel: $($_.Exception.Message))" }
if ($suspects.Count -eq 0) { Line Green "  [OK] nenhum node/code/git referencia 'frugal'." }
else {
  Line Yellow ("  [!] {0} processo(s) tocam algum worktree frugal:" -f $suspects.Count)
  $suspects | Format-Table PID,Name,MainRepo,Cmd -AutoSize | Out-String | Write-Host
  $mains = $suspects | Where-Object MainRepo
  if ($mains) { [void]$warn.Add("$($mains.Count) processo(s) tocam o REPO PRINCIPAL (PID: $($mains.PID -join ', '))") }
  else { Line Green "  [OK] nenhum toca o repo principal -- todos em worktrees separados (frugal-*)." }
}

# --- 2) locks / corrupcao ----------------------------------------------------
Sect "2. Locks e sinais de corrupcao no .git"
$locks = @()
$locks += Get-ChildItem -Path $gitDir -Filter "index.lock" -ErrorAction SilentlyContinue
$locks += Get-ChildItem -Path (Join-Path $gitDir "worktrees") -Recurse -Filter "index.lock" -ErrorAction SilentlyContinue
if ($locks) { Line Red ("  [X] index.lock: " + ($locks.FullName -join "; ")); [void]$red.Add("index.lock ativo") }
else        { Line Green "  [OK] sem index.lock." }
$corrupt = Get-ChildItem -Path $gitDir -Filter "*corrupt*" -ErrorAction SilentlyContinue
if ($corrupt) {
  Line Yellow ("  [!] backups de corrupcao (historico): " + ($corrupt.Name -join ", "))
  $recent = $corrupt | Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-2) }
  if ($recent) { [void]$warn.Add("corrupcao .git <2h: $($recent.Name -join ', ')") }
}

# --- 3) escritor vivo (double-sample) ----------------------------------------
Sect "3. Escritor vivo? (amostra, espera ${WatchSeconds}s, re-amostra)"
$watch = @("HEAD","index","config","FETCH_HEAD","ORIG_HEAD","packed-refs") | ForEach-Object { Join-Path $gitDir $_ }
$watch += Get-ChildItem -Path (Join-Path $gitDir "refs\heads") -Recurse -File -ErrorAction SilentlyContinue | Select-Object -Expand FullName
function Snap($paths){ $h=@{}; foreach($p in $paths){ if(Test-Path $p){ $h[$p]=(Get-Item $p).LastWriteTimeUtc.Ticks } }; return $h }
$s1 = Snap $watch
Line DarkGray "  ... a observar $($s1.Count) ficheiros do .git durante ${WatchSeconds}s"
Start-Sleep -Seconds $WatchSeconds
$s2 = Snap $watch
$changed = @()
foreach($k in $s2.Keys){ if(-not $s1.ContainsKey($k) -or $s1[$k] -ne $s2[$k]){ $changed += (Split-Path $k -Leaf) } }
if ($changed.Count -gt 0) { Line Red ("  [X] ESCRITOR VIVO -- .git mudou: " + (($changed|Select-Object -Unique) -join ", ")); [void]$red.Add("escritor git ATIVO (mtimes mudaram em ${WatchSeconds}s)") }
else { Line Green "  [OK] .git estavel na janela (nenhum escritor detetado)." }

# --- 4) integridade read-only ------------------------------------------------
Sect "4. Integridade (read-only, nativa)"
$branch = (RunGit @("rev-parse","--abbrev-ref","HEAD")) -join ""
$head   = (RunGit @("rev-parse","--short","HEAD")) -join ""
Line White ("  Branch: {0} . HEAD: {1}" -f $branch,$head)
if ($head -notlike "$ExpectedHead*") { [void]$warn.Add("HEAD ($head) != esperado ($ExpectedHead) -- confirma o ponto de partida") }
Line White "  git status (short):"
(RunGit @("status","--short","--branch")) | Select-Object -First 15 | ForEach-Object { Line DarkGray ("    "+$_) }
Line White "  git worktree list:"
(RunGit @("worktree","list")) | ForEach-Object { Line DarkGray ("    "+$_) }
Line White "  git fsck (pode demorar num repo grande)..."
$fsck = RunGit @("fsck","--full","--no-progress","--no-dangling")
$fsckBad = $fsck | Where-Object { $_ -match "error|missing|corrupt" }
if ($fsckBad) { Line Yellow ("    [!] fsck: " + (($fsckBad|Select-Object -First 6) -join " | ")); [void]$warn.Add("git fsck com avisos") }
else          { Line Green "    [OK] fsck sem erros." }
$clf = Join-Path $RepoPath "tools\router\classify.js"
if (Test-Path $clf) {
  $sha = (Get-FileHash $clf -Algorithm SHA256).Hash.ToLower()
  if ($sha -eq $FrozenSha.ToLower()) { Line Green "  [OK] classify.js FROZEN intacto." }
  else { Line Red "  [X] classify.js SHA != frozen (STOP absoluto)"; [void]$red.Add("classify.js nao e o SHA frozen") }
} else { [void]$warn.Add("classify.js nao encontrado") }

# --- 5) veredito -------------------------------------------------------------
Sect "VEREDITO"
if ($red.Count -eq 0 -and $warn.Count -eq 0) { Line Green "VERDE -- lousa limpa. Seguro abrir UMA sessao dona unica." }
elseif ($red.Count -eq 0) { Line Yellow "AMARELO -- sem bloqueio duro; confirma os avisos:"; $warn | ForEach-Object { Line Yellow "   - $_" } }
else { Line Red "VERMELHO -- NAO abras a sessao. Bloqueios:"; $red | ForEach-Object { Line Red "   x $_" }; $warn | ForEach-Object { Line Yellow "   - $_" } }

Sect "PROXIMO PASSO"
Line White "  VERDE/AMARELO-controlado -> abre UMA sessao CC nova e cola o masterprompt v2."
Line DarkGray "  Log: $log"
try { Stop-Transcript | Out-Null } catch {}
