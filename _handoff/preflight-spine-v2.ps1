# preflight-spine-v2.ps1 -- Verificador de "lousa limpa" para a wave Spine V2
# ASCII-only (PS 5.1 sem BOM). Read-only + seguro. Nao mata processos por defeito.
# Auditar SEMPRE pelo log (preflight-spine-v2.log), nunca por print.
#
# O QUE FAZ (autonomo, seguro):
#   1. Processos node/code/git que tocam o repo (com command-line).
#   2. Locks (.git/index.lock, worktrees) e backups de corrupcao.
#   3. Escritor vivo: amostra mtimes do .git, espera N seg, re-amostra, compara.
#   4. Integridade read-only: git fsck, status, worktree list, HEAD, classify.js SHA.
#   5. Veredito VERDE/AMARELO/VERMELHO.
# O QUE NAO FAZ: nao mata, nao reset/clean/checkout/restore, nao stagea.
#   -KillFrugalNode oferece matar (1 a 1, confirmado) -- ver AVISO no fim.

[CmdletBinding()]
param(
  [string]$RepoPath     = "C:\Users\Paulo Loureiro\frugal",
  [string]$ExpectedHead = "3825715",
  [string]$FrozenSha    = "427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f",
  [int]$WatchSeconds    = 20,
  [switch]$KillFrugalNode
)

$ErrorActionPreference = "Continue"
$log = Join-Path $PSScriptRoot "preflight-spine-v2.log"
try { Start-Transcript -Path $log -Force | Out-Null } catch {}

$red = New-Object System.Collections.ArrayList
$warn = New-Object System.Collections.ArrayList
function Line($c,$t){ Write-Host $t -ForegroundColor $c }
function H($t){ Write-Host ""; Write-Host "== $t ==" -ForegroundColor Cyan }

Line White "SPINE V2 . PREFLIGHT -- lousa limpa antes da sessao dona"
Line DarkGray ("Repo: {0} . HEAD esperado: {1} . watch: {2}s . {3}" -f $RepoPath,$ExpectedHead,$WatchSeconds,(Get-Date -Format s))

if (-not (Test-Path $RepoPath))                    { Line Red "ABORT: repo nao existe"; try{Stop-Transcript|Out-Null}catch{}; exit 2 }
if (-not (Test-Path (Join-Path $RepoPath ".git"))) { Line Red "ABORT: sem .git"; try{Stop-Transcript|Out-Null}catch{}; exit 2 }
$gitDir = Join-Path $RepoPath ".git"

# --- 1) processos ------------------------------------------------------------
H "1. Processos node/code/git a tocar o repo"
$suspects = @()
try {
  $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='code.exe' OR Name='git.exe'" -ErrorAction Stop
  foreach ($p in $procs) {
    $cl = [string]$p.CommandLine
    if ($cl -match "frugal") {
      $suspects += [pscustomobject]@{
        PID=$p.ProcessId; Name=$p.Name;
        Auto=($cl -match "auto-sync|hub-pull|sync-hooks|mooter-autopilot|mooter\.ps1|autopilot");
        Cmd=($cl.Substring(0,[Math]::Min(120,$cl.Length)))
      }
    }
  }
} catch { Line Yellow "  (Win32_Process indisponivel: $($_.Exception.Message))" }
if ($suspects.Count -eq 0) { Line Green "  [OK] nenhum node/code/git referencia 'frugal'." }
else {
  Line Yellow ("  [!] {0} processo(s) tocam o repo:" -f $suspects.Count)
  $suspects | Format-Table PID,Name,Auto,Cmd -AutoSize | Out-String | Write-Host
  $autos = $suspects | Where-Object Auto
  if ($autos) { [void]$warn.Add("automacao Mooter viva (PID: $($autos.PID -join ', '))") }
  [void]$warn.Add("$($suspects.Count) processo(s) tocam o repo -- confirma que sao esperados")
}

# --- 2) locks / corrupcao ----------------------------------------------------
H "2. Locks e sinais de corrupcao no .git"
$locks = @()
$locks += Get-ChildItem -Path $gitDir -Filter "index.lock" -ErrorAction SilentlyContinue
$locks += Get-ChildItem -Path (Join-Path $gitDir "worktrees") -Recurse -Filter "index.lock" -ErrorAction SilentlyContinue
if ($locks) { Line Red ("  [X] index.lock: " + ($locks.FullName -join "; ")); [void]$red.Add("index.lock ativo") }
else        { Line Green "  [OK] sem index.lock." }
$corrupt = Get-ChildItem -Path $gitDir -Filter "*corrupt*" -ErrorAction SilentlyContinue
if ($corrupt) {
  Line Yellow ("  [!] backups de corrupcao: " + ($corrupt.Name -join ", "))
  $recent = $corrupt | Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-6) }
  if ($recent) { [void]$warn.Add("corrupcao .git <6h: $($recent.Name -join ', ')") }
}

# --- 3) escritor vivo (double-sample) ----------------------------------------
H "3. Escritor vivo? (amostra, espera ${WatchSeconds}s, re-amostra)"
$watch = @("HEAD","index","config","FETCH_HEAD","ORIG_HEAD","packed-refs") | ForEach-Object { Join-Path $gitDir $_ }
$watch += Get-ChildItem -Path (Join-Path $gitDir "refs\heads") -Recurse -File -ErrorAction SilentlyContinue | Select-Object -Expand FullName
function Snap($paths){ $h=@{}; foreach($p in $paths){ if(Test-Path $p){ $h[$p]=(Get-Item $p).LastWriteTimeUtc.Ticks } }; return $h }
$s1 = Snap $watch
Line DarkGray "  ... a observar $($s1.Count) ficheiros do .git durante ${WatchSeconds}s"
Start-Sleep -Seconds $WatchSeconds
$s2 = Snap $watch
$changed = @()
foreach($k in $s2.Keys){ if(-not $s1.ContainsKey($k) -or $s1[$k] -ne $s2[$k]){ $changed += (Split-Path $k -Leaf) } }
foreach($k in $s1.Keys){ if(-not $s2.ContainsKey($k)){ $changed += ((Split-Path $k -Leaf)+"(sumiu)") } }
if ($changed.Count -gt 0) { Line Red ("  [X] ESCRITOR VIVO -- .git mudou: " + (($changed|Select-Object -Unique) -join ", ")); [void]$red.Add("escritor git ATIVO (mtimes mudaram em ${WatchSeconds}s)") }
else { Line Green "  [OK] .git estavel na janela (nenhum escritor detetado)." }

# --- 4) integridade read-only ------------------------------------------------
H "4. Integridade (read-only, nativa)"
function Git($a){ & git -C $RepoPath @a 2>&1 }
$branch = (Git @("rev-parse","--abbrev-ref","HEAD")) -join ""
$head   = (Git @("rev-parse","--short","HEAD")) -join ""
Line White ("  Branch: {0} . HEAD: {1}" -f $branch,$head)
if ($head -notlike "$ExpectedHead*") { [void]$warn.Add("HEAD ($head) != esperado ($ExpectedHead)") }
Line DarkGray ("  git status:`n    " + (((Git @("status","--short","--branch"))|Select-Object -First 12) -join "`n    "))
Line White "  git worktree list:"; (Git @("worktree","list")) | ForEach-Object { Line DarkGray ("    "+$_) }
Line White "  git fsck (pode demorar num repo grande)..."
$fsck = Git @("fsck","--full","--no-progress")
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
H "VEREDITO"
if ($red.Count -eq 0 -and $warn.Count -eq 0) { Line Green "VERDE -- lousa limpa. Seguro abrir UMA sessao dona unica." }
elseif ($red.Count -eq 0) { Line Yellow "AMARELO -- sem bloqueio duro; confirma os avisos:"; $warn | ForEach-Object { Line Yellow "   - $_" } }
else { Line Red "VERMELHO -- NAO abras a sessao. Bloqueios:"; $red | ForEach-Object { Line Red "   x $_" }; $warn | ForEach-Object { Line Yellow "   - $_" } }

# --- 6) kill opcional --------------------------------------------------------
if ($KillFrugalNode -and $suspects.Count -gt 0) {
  H "6. Matar processos (confirmacao por PID)"
  Line Yellow "  AVISO: matar node a meio de escrita git CORROMPE o .git (foi assim que index/config corromperam)."
  Line Yellow "  Preferivel: fechar a janela/sessao limpa (Ctrl+C no terminal dela) e re-correr o preflight."
  foreach ($s in $suspects) {
    $ans = Read-Host ("  Matar PID {0} [{1}]? (s/N) {2}" -f $s.PID,$s.Name,$s.Cmd)
    if ($ans -eq "s") { try { Stop-Process -Id $s.PID -Force -ErrorAction Stop; Line Green "    morto." } catch { Line Red "    falhou: $($_.Exception.Message)" } }
    else { Line DarkGray "    saltado." }
  }
}

H "PROXIMO PASSO"
Line White "  VERDE -> abre UMA sessao CC nova e cola o masterprompt v2. O Day 0 re-verifica isto sozinho."
Line DarkGray "  AMARELO/VERMELHO -> resolve, fecha janelas/automacao, re-corre."
Line DarkGray "  Log completo: $log"
try { Stop-Transcript | Out-Null } catch {}
