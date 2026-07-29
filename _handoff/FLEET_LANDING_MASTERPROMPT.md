# ⇄ COWORK → CC · FLEET LANDING — aterrar a linhagem Fleet num PR limpo (pré-req da Mesh A2)

> Cowork · 2026-07-17 · Budget ≤8k · Origem: STOP 0 da Mesh (decisão 2: "nunca stacked sobre PR
> vermelho") + achado do Codex: os ficheiros que a A2 precisa vivem só no #232 (CONFLICTING/DIRTY,
> ratchet+Vercel vermelhos) e na branch feat/fleet-arm. Casa: `_handoff/`.

🎯 GOAL   Colocar em origin/main, via PR novo e limpo, a linhagem Fleet mínima que a Mesh A2 exige:
          `_handoff/fleet/{fleet-forever.mjs, fleet-watchdog.mjs, gpu-stream.mjs, vram-preflight.mjs,
          ecosystem.config.cjs}` + testes — SEM mergear nem consertar o #232 inteiro.
📍 WHERE  Worktree `../frugal-fleet-landing` · branch `feat/fleet-landing` · from origin/main
          (fetch antes; confirma o SHA pós-merges no handoff).
🔒 GUARD  classify.js FROZEN (sha `427d8c0b…`) · git add seletivo · NUNCA mergear/fechar/rebasear o
          #232 (destino dele = decisão Paulo depois) · NUNCA tocar worktrees do Codex
          (frugal-lingua-franca, futuras frugal-harmony-mesh-*) · zero ativação pm2/tasks (runtime =
          gate nativo do Paulo pós-merge) · zero escrita em ~/.claude/** · invariantes do flicker-fix
          preservados (windowsHide em TODO spawn; 1 nvidia-smi persistente, nunca spawn por ciclo) ·
          handoffs com preflight + rodapés CCA e council (canon do #255).

## FASE 0 — RECON (read-only) → ⛔ STOP A
1. Confronta as 3 fontes ficheiro a ficheiro (para os 5 alvos + testes associados):
   - origin/feat/fleet-arm (28 commits, tag insurance/fleet-arm-2026-07-16 @ 4f72359 — a fonte
     provável: o flicker-fix 21408f5 criou gpu-stream.mjs + exec-hidden.mjs + gpu-stream.test.mjs
     e editou vram-preflight/fleet-watchdog/fleet-orchestrator/ecosystem)
   - o head do PR #232 (gh pr view 232 --json files,headRefName + git show — read-only)
   - origin/main (o que já existe lá, se algo)
2. Para cada ficheiro: qual versão é a mais recente/correta, que dependências arrasta
   (ex.: exec-hidden.mjs, run-watchdog-hidden.vbs), e o que do #232 NÃO deve vir junto.
3. ♻️ REUSE respondido: isto é PORT seletivo de trabalho já feito e testado (20/20 no flicker-fix),
   não reescrita. Zero lógica nova além de adaptação de paths/imports.
⛔ STOP A: devolve o plano de extração (tabela ficheiro × fonte × porquê × dependências) + a lista
   exata do que fica de fora. Espera YES antes de qualquer edição.

## FASE 1 — PORT (após YES do STOP A)
- Allowlist = exatamente os ficheiros do plano aprovado no STOP A (esperado: os 5 alvos + testes
  + dependências mínimas nomeadas tipo exec-hidden.mjs). Nada além.
- Cada ficheiro portado com proveniência no commit (de que branch/commit veio, sha da fonte).
- Testes vêm junto e rodam verdes no worktree limpo (node --test nos .test.mjs do fleet).
- Se um alvo exigir mudança além de paths/imports → não improvisa: reporta no handoff como
  CHANGES-needed com o motivo.

## ✅ GATE
node --test _handoff/fleet/*.test.mjs (output cru) · zero regressão nas suites que já eram verdes ·
git diff --check · sha classify intacta · diff crítico no handoff (FC-8: consumidor sem mount) ·
prova de que NENHUM spawn novo perde windowsHide (grep spawnSync/execSync no diff).

## ⛔ STOPs
STOP A (recon/plano) → STOP B (staged, diff + gates, pré-commit) → commit / push / PR draft /
merge = autorizações separadas, como sempre. Merge = Paulo.

## ⏭ NEXT (fora desta wave — não fazer)
Destino do #232 (fechar como superseded ou reaproveitar o resto) = decisão Paulo pós-landing ·
ativação pm2/schtasks nativa = gate Paulo · Mesh A2 só depois disto mergeado + A1 mergeada.
