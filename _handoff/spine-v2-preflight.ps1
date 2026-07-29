<#
  spine-v2-preflight.ps1  —  Verificador de "lousa limpa" para a wave Spine V2
  ------------------------------------------------------------------------------
  O QUE FAZ (autónomo, SEGURO):
    1. Lista processos node/code/git que tocam o repo frugal (com command-line).
    2. Deteta locks (.git/index.lock, worktrees/*/index.lock) e backups de corrupção.
    3. DETETA ESCRITOR VIVO: amostra mtimes do .git, espera N seg, re-amostra, compara.
    4. Integridade read-only: git fsck, git status, worktree list, HEAD vs esperado,
       e o SHA frozen do classify.js.
    5. Emite VEREDITO verde/vermelho: seguro (ou não) abrir a sessão dona única.

  O QUE **NÃO** FAZ por defeito:
    - NÃO mata processos. NÃO corre git reset/clean/checkout/restore. NÃO stagea nada.
    - Só com -KillFrugalNode é que oferece matar node que referencie o repo — 1 a 1, com confirmação.

  USO:
    powershell -ExecutionPolicy Bypass -File .\spine-v2-preflight.ps1
    powershell -ExecutionPolicy Bypass -File .\spine-v2-preflight.ps1 -WatchSeconds 30
    powershell -ExecutionPolicy Bypass -File .\spine-v2-preflight.ps1 -KillFrugalNode   # cuidado: pergunta por PID
#>

[CmdletBinding()]
param(
  [string]$RepoPath    = "C:\Users\Paulo Loureiro\frugal",
  [string]$ExpectedHead = "3825715",   # Fase A rebased sobre origin/main
  [string]$FrozenSha   = "427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f",
  [int]$WatchSeconds   = 20,
  [switch]$KillFrugalNode
)

$ErrorActionPreference = "Continue"
$red=@(); $warn=@()   # acumuladores de veredito

function Line($c,$t){ Write-Host $t -ForegroundColor $c }
function H($t){ Write-Host ""; Write-Host "== $t ==" -ForegroundColor Cyan }

Line White "SPINE V2 · PREFLIGHT — lousa limpa antes da sessao dona"
Line DarkGray ("Repo: {0}  ·  HEAD esperado: {1}  ·  janela de watch: {2}s" -f $RepoPath,$ExpectedHead,$WatchSeconds)

# --- 0) repo existe e e git ---------------------------------------------------
if (-not (Test-Path $RepoPath))            { Line Red "ABORT: repo nao existe: $RepoPath"; exit 2 }
if (-not (Test-Path (Join-Path $RepoPath ".git"))) { Line Red "ABORT: nao ha .git em $RepoPath"; exit 2 }
$gitDir = Join-Path $RepoPath ".git"

# --- 1) processos que tocam o repo -------------------------------------------
H "1. Processos node/code/git a tocar o repo"
$suspects = @()
try {
  $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='code.exe' OR Name='git.exe'" -ErrorAction Stop
  foreach ($p in $procs) {
    $cl = [string]$p.CommandLine
    if ($cl -match "frugal") {
      $suspects += [pscustomobject]@{
        PID=$p.ProcessId; Name=$p.Name;
        Auto = ($cl -match "auto-sync|hub-pull|sync-hooks|mooter-autopilot|mooter\.ps1|autopilot");
        Cmd = ($cl.Substring(0,[Math]::Min(140,$cl.Length)))
      }
    }
  }
} catch { Line Yellow "  (nao consegui ler Win32_Process: $($_.Exception.Message))" }

if ($suspects.Count -eq 0) {
  Line Green "  OK — nenhum node/code/git referencia 'frugal'."
} else {
  Line Yellow ("  {0} processo(s) referenciam o repo:" -f $suspects.Count)
  $suspects | Format-Table PID,Name,Auto,Cmd -AutoSize | Out-String | Write-Host
  $autos = $suspects | Where-Object Auto
  if ($autos) { $warn += "automacao Mooter viva (auto-sync/hub/autopilot) — PID(s): $($autos.PID -join ', ')" }
  $warn += "$($suspects.Count) processo(s) tocam o repo — confirma que sao TEUS/esperados"
}

# --- 2) locks e backups de corrupcao -----------------------------------------
H "2. Locks e sinais de corrupcao no .git"
$locks = @()
$locks += Get-ChildItem -Path $gitDir -Filter "index.lock" -ErrorAction SilentlyContinue
$locks += Get-ChildItem -Path (Join-Path $gitDir "worktrees") -Recurse -Filter "index.lock" -ErrorAction SilentlyContinue
if ($locks) { Line Red ("  index.lock presente(s): " + ($locks.FullName -join "; ")); $red += "index.lock ativo (escritor a meio ou stale)" }
else        { Line Green "  OK — sem index.lock." }

$corrupt = Get-ChildItem -Path $gitDir -Filter "*corrupt*" -ErrorAction SilentlyContinue
if ($corrupt) {
  Line Yellow ("  backups de corrupcao (historico): " + ($corrupt.Name -join ", "))
  $recent = $corrupt | Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-6) }
  if ($recent) { $warn += "corrupcao de .git nas ultimas 6h: $($recent.Name -join ', ') — .git instavel" }
}

# --- 3) DETETOR DE ESCRITOR VIVO (double-sample) -----------------------------
H "3. Escritor vivo? (amostra mtimes, espera ${WatchSeconds}s, re-amostra)"
$watch = @("HEAD","index","config","FETCH_HEAD","ORIG_HEAD","packed-refs") | ForEach-Object { Join-Path $gitDir $_ }
$watch += Get-ChildItem -Path (Join-Path $gitDir "refs\heads") -Recurse -File -ErrorAction SilentlyContinue | Select-Object -Expand FullName
function Snap($paths){ $h=@{}; foreach($p in $paths){ if(Test-Path $p){ $h[$p]=(Get-Item $p).LastWriteTimeUtc.Ticks } }; $h }
$s1 = Snap $watch
Line DarkGray "  ... a observar $($s1.Count) ficheiros do .git durante ${WatchSeconds}s"
Start-Sleep -Seconds $WatchSeconds
$s2 = Snap $watch
$changed = @()
foreach($k in $s2.Keys){ if(-not $s1.ContainsKey($k) -or $s1[$k] -ne $s2[$k]){ $changed += (Split-Path $k -Leaf) } }
foreach($k in $s1.Keys){ if(-not $s2.ContainsKey($k)){ $changed += ((Split-Path $k -Leaf)+" (sumiu)") } }
if ($changed.Count -gt 0) {
  Line Red ("  ESCRITOR VIVO — .git mudou durante a janela: " + (($changed | Select-Object -Unique) -join ", "))
  $red += "escritor git ATIVO agora (mtimes mudaram em ${WatchSeconds}s)"
} else {
  Line Green "  OK — .git estavel durante a janela (nenhum escritor detetado)."
}

# --- 4) integridade read-only -------------------------------------------------
H "4. Integridade (read-only)"
function Git($args){ & git -C $RepoPath @args 2>&1 }
$branch = (Git @("rev-parse","--abbrev-ref","HEAD")) -join ""
$head   = (Git @("rev-parse","--short","HEAD")) -join ""
Line White ("  Branch: {0}  ·  HEAD: {1}" -f $branch,$head)
if ($head -notlike "$ExpectedHead*") { $warn += "HEAD ($head) != esperado ($ExpectedHead) — confirma o ponto de partida" }

$st = Git @("status","--short","--branch")
Line DarkGray ("  git status:`n    " + (($st | Select-Object -First 12) -join "`n    "))

Line White "  git worktree list:"
(Git @("worktree","list")) | ForEach-Object { Line DarkGray ("    " + $_) }

Line White "  git fsck (pode demorar)..."
$fsck = Git @("fsck","--full","--no-progress")
$fsckBad = $fsck | Where-Object { $_ -match "error|missing|corrupt|dangling commit" }
if ($fsckBad) { Line Yellow ("    fsck aponta: " + (($fsckBad | Select-Object -First 6) -join " | ")); $warn += "git fsck com avisos (ver output)" }
else          { Line Green "    OK — fsck sem erros." }

# classify.js frozen
$clf = Join-Path $RepoPath "tools\router\classify.js"
if (Test-Path $clf) {
  $sha = (Get-FileHash $clf -Algorithm SHA256).Hash.ToLower()
  if ($sha -eq $FrozenSha.ToLower()) { Line Green "  OK — classify.js FROZEN intacto." }
  else { Line Red ("  classify.js SHA != frozen!`n    got:    $sha`n    frozen: $FrozenSha"); $red += "classify.js NAO e o SHA frozen (STOP absoluto)" }
} else { $warn += "classify.js nao encontrado em tools\router" }

# --- 5) veredito --------------------------------------------------------------
H "VEREDITO"
if ($red.Count -eq 0 -and $warn.Count -eq 0) {
  Line Green "VERDE — lousa limpa. Seguro abrir UMA sessao dona unica."
} elseif ($red.Count -eq 0) {
  Line Yellow "AMARELO — sem bloqueio duro, mas confirma os avisos antes de abrir a sessao:"
  $warn | ForEach-Object { Line Yellow "   - $_" }
} else {
  Line Red "VERMELHO — NAO abras a sessao ainda. Bloqueios:"
  $red  | ForEach-Object { Line Red    "   x $_" }
  $warn | ForEach-Object { Line Yellow "   - $_" }
}

# --- 6) kill opcional (so com -KillFrugalNode, 1 a 1, com confirmacao) --------
if ($KillFrugalNode -and $suspects.Count -gt 0) {
  H "6. Matar processos frugal (confirmacao por PID)"
  Line Yellow "  ATENCAO: so mata o que confirmares. Nao mates o que nao reconheces sem pensar."
  foreach ($s in $suspects) {
    $ans = Read-Host ("  Matar PID {0} [{1}] ? (s/N)  {2}" -f $s.PID,$s.Name,$s.Cmd)
    if ($ans -eq "s") { try { Stop-Process -Id $s.PID -Force -ErrorAction Stop; Line Green "    morto." } catch { Line Red "    falhou: $($_.Exception.Message)" } }
    else { Line DarkGray "    saltado." }
  }
  Line DarkGray "  (re-corre o preflight sem -KillFrugalNode para reconfirmar o veredito)"
}

# --- proximos passos ----------------------------------------------------------
H "PROXIMO PASSO"
Line White "  Se VERDE: abre UMA sessao CC nova e cola o masterprompt v2 (WAVE_HANDOFF_SPINE_V2_ONESHOT_2026-07-14.md)."
Line White "  O Day 0 da sessao re-verifica isto sozinho antes de escrever nada."
Line DarkGray "  Se AMARELO/VERMELHO: resolve os pontos, fecha janelas/automacao, e re-corre este preflight."
