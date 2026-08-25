# ⇄ COWORK → CC · FOUNDATION RESET — fundação impecável (F1→F4 + F6)

🎯 **GOAL** Zerar a dívida operacional do repo sem perder um byte de trabalho: snapshot forense → spine A aterra → triagem dos 26 M → lixo/causa-raiz → poda de worktrees. Régua = §5 do FOUNDATION_STUDY_2026-07-12 (entregue ao Paulo no Cowork em 2026-07-12).

📍 **WHERE** Repo `C:\Users\Paulo Loureiro\frugal` (árvore principal, branch `wave/honest-controls`). Fases F3+ trabalham em worktrees frescos de `origin/main` (40e84cc, v0.16.66) — **nunca** na árvore principal.

🔒 **GUARD** (invariantes — violar = ABORT)
- `tools/router/classify.js` FROZEN — sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` intacto em todo commit.
- `git add` seletivo SEMPRE. `git add -A` proibido, inclusive no snapshot.
- Push, merge e delete só com OK explícito do Paulo (STOPs marcados).
- `frugal-lp-coerencia` tem sessão ativa (index 2026-07-12) — não tocar nesse worktree nem nos ficheiros que ele reivindica.
- SYNC.md 📥 fica 🟡 até o spine V2 fechar (regra do packet) — não marcar como lido nesta wave.
- Nada se apaga: mover para `_to_delete/foundation-2026-07-12/` ou arquivar. Delete físico é do Paulo.

---

## F1 — SNAPSHOT FORENSE (primeiro, sempre)

Objetivo: depois desta fase, nenhum erro posterior pode perder trabalho.

1. Na árvore principal: `git checkout -b backup/tree-snapshot-2026-07-12` (a partir do estado atual, sem mexer em nada).
2. Adicionar EM LOTES NOMEADOS (um commit por lote, mensagens abaixo), excluindo os 243 temp de `scripts/`:
   - Lote M-code: os 16 M de `tools/router/`, `packages/` e `landing/` → `wip(snapshot): 16 M code — proveniência a triar (F3)`
   - Lote M-canon: `AGENTS.md CLAUDE.md SYNC.md GEMINI.md mooter.code-workspace package.json package-lock.json docs/strategy/PERFECT_HANDOFF_SPEC.md` + os 3 M de `_handoff/` → `wip(snapshot): canónicos + handoff M`
   - Lote docs-novos: os 7 untracked de `docs/` + `packages/vscode-extension/src/lp-aggregates.js`+test + `tools/docs-hygiene.js`+test + `tools/router/quota-live.js`+`quota-status.js` + `packages/worktree-conductor/package-lock.json` → `wip(snapshot): untracked legítimos`
3. `git checkout wave/honest-controls` (a árvore volta ao estado dirty — o snapshot é uma cópia, não uma mudança).

Nota: passo 3 exige cuidado — commits do snapshot LIMPAM o status na branch backup; ao voltar, os ficheiros ficam como committed-in-backup mas dirty aqui? Não: commit move o conteúdo para a branch backup; o checkout de volta restaura wave/honest-controls SEM os commits, e o working tree fica igual (dirty). Verificar com `git status` que os 421 continuam lá. O snapshot vive em `backup/tree-snapshot-2026-07-12`.

**⛔ STOP F1:** mostrar ao Paulo `git log --stat backup/tree-snapshot-2026-07-12` → OK dele → `git push -u origin backup/tree-snapshot-2026-07-12`.

✅ **GATE F1:** branch backup existe no origin · working tree principal inalterado (421 dirty) · classify.js sha intacto.

## F2 — SPINE V2 FASE A ATERRA (desbloqueia o doctor)

Seguir o packet `_handoff/WAVE_HANDOFF_SPINE_V2_MASTERPROMPT.md` + decisões do gate A (memória Cowork 2026-07-10):
1. Worktree `frugal-handoff-spine-v2-a`, branch `feat/handoff-spine-v2-a-audit-fixes` @1d9d020: fechar os 3 nits P2 (branch `error != null` no ledger-decision.test · asserts expectedCwd+recent no handoff-accumulator.test · EXACT_DUPLICATES+PENDING_DELETION_BUCKETS no docs-hygiene.test).
2. Re-rodar Gate A completo (docs-hygiene 4/4 · doctor error=0 · ledger 23/23 · router · vscode full).
3. **⛔ STOP F2:** Gate verde → push (já autorizado no gate de 10-07) → abrir PR contra main (padrão #237) → **merge é do Paulo**.

✅ **GATE F2:** PR aberto, CI verde (exceto ratchet crónico — ver F4.5), Paulo mergeou.

## F3 — TRIAGEM FORENSE DOS 26 M (o coração)

Para CADA um dos 26 M na árvore principal, no worktree novo `../frugal-foundation-f3` (de `origin/main` pós-F2):

1. `git diff <file>` na árvore principal → confrontar com os handoffs conhecidos:
   - **Lote A (flicker-fix, allowlist aprovada 10-07):** `tools/router/backtest.js`, `vram_detect.js`, `packages/overclock-moo/src/runner.mjs`, `benchmark.mjs` — diffs descritos no handoff flicker-fix do SYNC.md. Primeiro PR (já provado: 0 flashes 2×, backtest exit 0).
   - **Lote B (router extras):** `chip-composer.js`, `gsd-statusline.js`, `ledger-decision.js`+test, `tools/router/package.json` — identificar wave de origem (candidatos: quota-aware, W-UX, spine) ANTES de commitar.
   - **Lote C (vscode-extension):** `extension.js`, `host-extra.js`, `handoff-accumulator.test.js` + untracked `lp-aggregates.js`+test — ⚠ risco de sobreposição com spine A e lp-coerencia; comparar com o que já aterrou via #245 e com o branch do spine.
   - **Lote D (landing):** 3 ficheiros — identificar origem.
   - **Lote E (canónicos):** AGENTS/CLAUDE/SYNC/GEMINI/workspace/package.json — parte é a sessão IA 07-07, parte é Cowork 07-10. SYNC.md NÃO entra (segue regra do spine).
   - **Lote F (docs novos):** os 7 untracked de docs/ — commit direto se coerentes com info-arch (AGENTS.md §IA).
2. Aplicar cada lote no worktree F3 (patch via `git diff | git apply` ou checkout dos paths), 1 branch por lote (`chore/foundation-lote-<X>`), teste da área afetada verde, commit seletivo.
3. **Resgate dos 2 commits presos:** cherry-pick `28fe2e5` (IA sweep 07-07) e `eba5d3b` (runbook LP) de `wave/honest-controls` para um branch `chore/foundation-rescue-honest-controls`. Resolver conflitos a favor de origin/main quando o conteúdo já aterrou.
4. Diff residual = zero: após todos os lotes aterrados, `git status` na árvore principal deve mostrar cada M como idêntico ao novo main (então `git checkout -- <file>` limpa) ou o ficheiro entra num lote. Nenhum M pode "sobrar sem dono".

**⛔ STOP F3:** um STOP por lote antes do push. Paulo mergeia os PRs (ou autoriza batch).

✅ **GATE F3:** todos os PRs de lote merged · árvore principal com 0 ficheiros M · classify.js intacto · `wave/honest-controls` sem commits únicos (os 2 resgatados) → candidata a arquivo (tag `archive/honest-controls-2026-07-12` + delete, decisão Paulo).

## F4 — LIXO + CAUSA-RAIZ

1. Mover os 243 temp de `scripts/` (prefixos: `lec-`, `leq-`, `lecw-`, `lp-prompt-`, `lp-edit-`, `lp-undo-`, `lp-quality-`, `lp-del-`, `lp-tree-`, `le-task-snap-`, `lpa-`, `lpsk-`, `node-compile-cache`) para `_to_delete/foundation-2026-07-12/scripts/`. Listar antes num manifest.
2. Apagar (mover) `scripts/outside-secret.txt` (6 bytes, artefacto de fence-test) e `scripts/mooter-codex-vscode-screen.png` se sem uso.
3. **Causa-raiz:** localizar quem cria essas dirs (grep por `mkdtemp`/`scripts/lp`/`scripts/lec` nos testes de `packages/vscode-extension` e `tools/`) → trocar para `fs.mkdtempSync(path.join(os.tmpdir(), ...))`. Teste prova: rodar a suite → `git status` continua limpo.
4. Cinto-e-suspensórios no `.gitignore`: os prefixos temp acima sob `scripts/` (específicos, não `scripts/*`).
5. **Ratchet crónico:** investigar `no-frugal ratchet` (174 falhas). Decisão binária com o Paulo: consertar a régua (baseline atual como ponto de partida do ratchet) ou remover o required. Vermelho crónico proibido.
6. Arquivar `_handoff/` topo: rodar `node tools/docs-hygiene.js --doctor` (aterrado na F2) → mover ~90 .md executados/supersedidos para `_handoff/_archive/2026-07/` (o doctor lista; mover é mecânico). Manter apenas masterprompts de waves vivas (lp-coerencia, este).
7. PR único da F4 (inclui manifest do que foi movido). **Este masterprompt arquiva-se a si próprio neste PR.**

✅ **GATE F4:** `git status` ≤ 5 entradas na árvore principal · suite roda sem sujar o status · doctor `--strict` exit 0 · CI sem vermelho crónico.

## F6 — WORKTREES (depois de F3; F5 é matriz Cowork/Paulo, fora deste prompt)

1. Script no host (PowerShell): para cada um dos 39 worktrees, reportar `git status --porcelain | wc -l` + branch + último commit + se a branch está merged em origin/main.
2. Podar (com OK Paulo, lista completa antes): worktrees com 0 uncommitted E branch merged/arquivada — começar pelos 7 já aprovados no SYNC 07-07 (mp52a, land-mp52a, lpfix, lp4, lp45, lp47, audit).
3. NÃO tocar: `frugal-lp-coerencia` (ativo), `frugal-w2` (servers de demo), qualquer worktree com uncommitted > 0 (esses entram na matriz F5).
4. `git worktree prune` no fim.

✅ **GATE F6:** worktrees ≤ ~10, todos com justificativa de vida.

---

⏭ **NEXT** F5 (matriz dos 24 PRs + 61 branches + 8 stashes — o Cowork prepara a recomendação item a item, Paulo decide) · F7 guardrails (doctor required no CI · regra worktree-por-sessão no CLAUDE.md · recon semanal agendado no Cowork · Notion/vault).

📋 **BACK** (colar no Cowork ao fim de cada fase)
- Fase concluída + branch/PR + saída do gate (números reais, não "ok")
- Qualquer diff que não casou com handoff conhecido (lote órfão) — NÃO commitar; reportar
- `git status --porcelain | wc -l` da árvore principal antes/depois
