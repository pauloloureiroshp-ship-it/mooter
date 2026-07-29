# APPLY_MOO_SKILLS.ps1 v2 - aplica as 5 skills camada-1 nativamente (script-first, log-verified)
# v2 fixes: detecao de worktree por Test-Path (v1 comparava \ contra / e nunca casava).
# NAO faz push (gate Paulo). Idempotente. ASCII.

$ErrorActionPreference = "Continue"
$repo    = "C:\Users\Paulo Loureiro\frugal"
$wt      = "C:\Users\Paulo Loureiro\frugal-moo-skills"
$staging = Join-Path $repo "_handoff\moo-skills-staging"
$log     = Join-Path $repo "_handoff\apply-moo-skills.log"
$branch  = "feat/moo-skills"
$skills  = @("moo-council","moo-handoff","moo-handoff-check","moo-masterprompt","moo-decision")

function W($m){ $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"; $line = "$ts  $m"; Add-Content -Path $log -Value $line -Encoding ASCII; Write-Host $line }

Set-Content -Path $log -Value "=== APPLY MOO SKILLS v2 ===" -Encoding ASCII
Set-Location $repo
W "repo: $repo"

# 1) fetch + verificar canon em main (gate de entrada)
git fetch origin 2>&1 | Out-Null
$canon = git show origin/main:docs/agent-context/AGENT_CONTEXT_PROTOCOL.md 2>$null | Select-String "Lingua Franca v1"
if(-not $canon){
  W "STOP: '#255 / Lingua Franca v1' NAO esta em origin/main. ABORTADO."
  exit 1
}
W "OK canon 'Lingua Franca v1' presente em origin/main."

# 2) worktree feat/moo-skills sobre o main atual (detecao por filesystem, nao regex)
if (Test-Path (Join-Path $wt ".git")) {
  W "worktree ja existe; a alinhar a $branch @ origin/main..."
  git -C $wt fetch origin 2>&1 | Out-Null
  git -C $wt checkout -B $branch origin/main 2>&1 | ForEach-Object { W "  git> $_" }
} else {
  if (Test-Path $wt) { W "STOP: pasta $wt existe mas nao e worktree git. ABORTADO."; exit 1 }
  W "a criar worktree $wt (branch $branch off origin/main)..."
  git worktree add -B $branch $wt origin/main 2>&1 | ForEach-Object { W "  git> $_" }
}

# 3) confirmar canon no worktree
$canonWt = Get-Content (Join-Path $wt "docs\agent-context\AGENT_CONTEXT_PROTOCOL.md") -ErrorAction SilentlyContinue | Select-String "Lingua Franca v1"
if(-not $canonWt){ W "STOP: canon nao apareceu no worktree apos setup. ABORTADO."; exit 1 }
W "OK canon presente no worktree."

# 4) colocar as skills (staged -> .claude/skills) + wave-brief deprecation + specs
foreach($s in $skills){
  $dst = Join-Path $wt ".claude\skills\$s"
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  Copy-Item (Join-Path $staging "$s\SKILL.md") (Join-Path $dst "SKILL.md") -Force
  W "  colocada skill $s"
}
$wb = Join-Path $wt ".claude\skills\wave-brief-compose"
if(Test-Path $wb){ Copy-Item (Join-Path $staging "_wave-brief-compose\SKILL.md") (Join-Path $wb "SKILL.md") -Force; W "  wave-brief-compose -> ponteiro de deprecacao" }
Copy-Item (Join-Path $repo "_handoff\MOOTER_SKILLS_MAP.md") (Join-Path $wt "_handoff\MOOTER_SKILLS_MAP.md") -Force -ErrorAction SilentlyContinue

# 5) validacao mecanica (preflight)
Set-Location $wt
W "a validar (handoff-preflight --check)..."
node tools/handoff-preflight.js --check 2>&1 | ForEach-Object { W "  check> $_" }
$shaOk = (Get-FileHash tools/router/classify.js -Algorithm SHA256).Hash.ToLower()
W "classify.js sha: $shaOk (esperado 427d8c0b...)"

# 6) git add SELETIVO + commit LOCAL (NAO push - gate Paulo)
foreach($s in $skills){ git add ".claude/skills/$s/SKILL.md" 2>&1 | Out-Null }
if(Test-Path ".claude/skills/wave-brief-compose/SKILL.md"){ git add ".claude/skills/wave-brief-compose/SKILL.md" 2>&1 | Out-Null }
W "staged (git status --short):"
git status --short 2>&1 | ForEach-Object { W "  $_" }
git commit -m "feat(skills): camada-1 protocol skills (moo-council/handoff/handoff-check/masterprompt/decision) [Cowork draft]" 2>&1 | ForEach-Object { W "  commit> $_" }
git log --oneline -2 2>&1 | ForEach-Object { W "  log> $_" }

W "=== DONE. Commit LOCAL feito em $branch. NAO foi feito push (gate Paulo)."
