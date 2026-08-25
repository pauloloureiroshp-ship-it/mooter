# ⇄ COWORK → CC · FOUNDATION RESET V2 — fundação impecável sob a TESE NOVA
**2026-07-14 · SUPERSEDE:** `FOUNDATION_RESET_MASTERPROMPT.md` + `FOUNDATION_CONFRONTO_CODEX.md` + `CLAUDE_MD_PROPOSED_2026-07-12.md` (arquivar os 3 no PR da F4, junto com este).
**Boot obrigatório:** Notion "🧭 Estado Atual & North Star · 2026-07-13" (sob Mooter HQ) — é a régua de tudo.

🎯 **GOAL** Zerar a dívida operacional (437 dirty · 24 PRs · 179 branches · 39 worktrees · 8 stashes) sem perder um byte, e realinhar o canon à tese nova — para que as fases F0-F5 do North Star construam sobre chão limpo.

## A TESE (mudou 2026-07-13 — decore antes de qualquer commit)

Mooter **não é** essencialmente um router. É **a experiência tipo Lovable para quem ultrapassou o Lovable**: projetos reais, complexos e duradouros, multi-agente, dentro do VS Code. Router = infraestrutura invisível. **5 pilares**: Resume · Plan · Route · Watch · Review. Régua brutal: *não melhora um dos 5 → não entra agora.* Fosso (o que a Microsoft nunca fará): roteamento local-first $0 · custo honesto por sessão · Resume de 60s · neutralidade multi-vendor com local. Não competir na casca da Agents window nativa — montar nela onde possível.

🔒 **GUARD** (violar = ABORT)
- `tools/router/classify.js` FROZEN — sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` intacto em todo commit.
- `git add` seletivo SEMPRE; `git add -A` proibido. Push/merge/delete só com OK do Paulo (⛔ STOPs).
- Nada se apaga: mover p/ `_to_delete/foundation-2026-07-14/` ou arquivar.
- Não tocar em worktrees com sessão ativa (verificar mtime dos index em `.git/worktrees/*/`; em 12-07 era `frugal-lp-coerencia`).
- SYNC.md 📥 fica 🟡 até o spine V2 fechar. Fatos de handoff = determinísticos (git plumbing), narrativa = local LLM best-effort — nunca o contrário.

## F1 — SNAPSHOT FORENSE (idempotente: se `backup/tree-snapshot-*` já existir, validar e pular)

1. Na árvore principal (`~/frugal`, `wave/honest-controls`): `git checkout -b backup/tree-snapshot-2026-07-14`.
2. Commits em LOTES NOMEADOS (sem os ~243 temp de `scripts/`):
   - **M-code**: os M de `tools/router/`, `packages/`, `landing/` → `wip(snapshot): M code — triagem na F3`
   - **M-canon**: `AGENTS.md CLAUDE.md SYNC.md GEMINI.md mooter.code-workspace package.json package-lock.json docs/strategy/PERFECT_HANDOFF_SPEC.md` + M de `_handoff/`
   - **docs-novos**: untracked de `docs/` + `lp-aggregates.js`+test + `tools/docs-hygiene.*` + `quota-live/quota-status.js`
   - **LOTE G**: `GEMINI.md .ai/ .gemini/ .codex/ docs/AGENT_HANDOFF.md scripts/setup-gemini-vscode.* scripts/diag-gemini-env.*` + copiar `../frugal-w2/docs/ai/AI_SETUP_SUMMARY.md` → `docs/ai/`
3. `git checkout wave/honest-controls` (working tree volta dirty — o snapshot é cópia, não mudança).
⛔ **STOP F1**: `git log --stat` do backup → OK Paulo → push. ✅ Gate: backup no origin · tree inalterada · sha classify intacto.

## F1.5 — PR DA RÉGUA (novo; maior alavanca segundo o North Star — ANTES de tudo o resto)

Worktree fresco: `git fetch origin && git worktree add ../frugal-regua origin/main -b chore/tese-v2`.
Atualizar APENAS os parágrafos de tese (nada mais):
- `AGENTS.md` §Project overview (l.8-12): substituir "local-first LLM router…" pela tese acima (5 pilares + fosso + router-como-infra). Manter o resto intacto.
- `docs/strategy/MOOTER_ROADMAP.md` §"A tese": idem; a régua de wave passa a ser os 5 pilares.
- `CLAUDE.md` header: idem (bloco novo completo do CLAUDE.md fica p/ F3-E′; aqui SÓ o parágrafo-tese).
- `README.md` primeira dobra: SE declarar router-first, alinhar (mínimo indispensável; copy profunda é wave PRIVACY/F0).
⛔ **STOP F1.5**: diff → OK Paulo → push + PR pequeno. ✅ Gate: `grep -ri "your llm router" AGENTS.md CLAUDE.md docs/strategy/MOOTER_ROADMAP.md` = 0 no branch.

## F2 — SPINE V2 FASE A ATERRA (é a fundação do pilar Resume)

Packet `_handoff/WAVE_HANDOFF_SPINE_V2_MASTERPROMPT.md`, decisões do gate 10-07: fechar 3 nits P2 → re-Gate A completo → push (autorizado) → PR padrão #237 → ⛔ merge é do Paulo. Nota: Fases B-F do spine = os 5 gates P1 do Perfect Handoff que o North Star F0 exige (lock no SYNC, reducer, matar `wave ship --force`, auto-lock, buffer) — a partir daqui spine e North Star F0 são a MESMA frente.

## F3 — TRIAGEM FORENSE DOS M (26+ ficheiros; re-medir no dia)

Worktree fresco de origin/main pós-F1.5. Por ficheiro: diff → casar com handoff de origem → lotes:
- **A flicker-fix** (allowlist 10-07, provado): `backtest.js vram_detect.js runner.mjs benchmark.mjs` → 1º PR.
- **B router extras** (`chip-composer gsd-statusline ledger-decision(+test) tools/router/package.json`) → identificar wave antes de commitar.
- **C vscode-extension** (`extension.js host-extra.js handoff-accumulator.test.js` + `lp-aggregates.*`) — ⚠ sobreposição com spine A e lp-coerencia; confrontar com o que já aterrou via #245.
- **D landing** (3 files) · **E canónicos** (inclui **E′**: aplicar CLAUDE.md v2 — enxuto, sem duplicar AGENTS.md, com secção "Session discipline": worktree-por-sessão · boot SYNC 📥 · build só de main/tag · testes → os.tmpdir · uncommitted aterra no dia) · **F docs novos** · **G Gemini/IA** (lote do F1 aterra aqui como PR).
- **Resgate**: cherry-pick `28fe2e5` + `eba5d3b` de `wave/honest-controls` → PR próprio; depois honest-controls fica sem commits únicos → tag `archive/honest-controls` + delete (decisão Paulo).
⛔ STOP por lote. ✅ Gate: árvore principal com 0 M · nenhum diff órfão commitado (órfão = reportar).

## F4 — LIXO + CAUSA-RAIZ

243 temp de `scripts/` → `_to_delete/` com manifest · achar o teste que escreve em `scripts/` → `os.tmpdir()` (prova: suite roda e `git status` fica limpo) · gitignore cinto-e-suspensórios (prefixos específicos) · `outside-secret.txt` fora · `no-frugal ratchet`: consertar baseline OU remover required (vermelho crónico proibido — decisão Paulo) · doctor `--strict` → arquivar ~90 .md do `_handoff/` topo em `_archive/2026-07/` (manter waves vivas: lp-coerencia, LP_H2, este) · **este masterprompt + os 3 supersedidos arquivam-se neste PR**.
✅ Gate: `git status` ≤ 5 · doctor strict exit 0 · CI sem vermelho crónico.

## F5 — MATRIZ (Cowork prepara, Paulo decide) — critério NOVO = tese

24 PRs, 61 branches sem upstream, 8 stashes. Cada item julgado por: **melhora um dos 5 pilares ou um dos 4 fossos?** → land/supersede/archive. Já decidido pelo North Star: council (wave64/62.5/pilar-council, −84k a −100k linhas) = **arquivar sem merge**. Candidatos a subir: #233 quota (Route) · #229 eval harness (Review) · #225 moo-loop (Watch) · #223/232 fleet (Route/Watch). Casca-compete (UI polish antigo) = viés de fechar.

## F6 — WORKTREES (pós-F3)

Script host: uncommitted + branch + merged? por worktree → podar limpos+merged (7 já aprovados no SYNC 07-07) → `git worktree prune`. Meta North Star: **WIP 3-5 sessões, nunca 17**. Manter ativos e w2 (servers).

## F7 — GUARDRAILS "nunca mais" (deixa a fundação vigiada)

1. docs-hygiene doctor `--strict` required no CI (vem do spine) · 2. Regra no CLAUDE.md: sessão NUNCA na árvore principal — worktree fresco de origin/main; build/package só de main/tag · 3. Drift checks: instalado-vs-git (vsix) · classifier-vs-executor (registry fail-closed) · copy-vs-runtime (privacy) · **tese-vs-canon** (grep router-first = 0) · 4. Recon semanal Cowork (dirty/PRs/branches/worktrees/stashes + "todo marco tem Notion+vault?") · 5. WIP cap 3-5 · 6. Higiene por LLM local = doctor detecta (determinístico) + moos PROPÕEM diffs em PR gated — nunca escrita autônoma.

## DEPOIS DA FUNDAÇÃO (não é deste masterprompt — é o North Star F0-F5)

F0 "Não mentir" (5 gates P1 via spine B-F · privacy/data-policy · testes plugin 8→≥60 · SYNC não corrompe com 3 sessões) → F1 Resume 60s → F2 Watch enxuto → F3 Route invisível/Settings → F4 Plan-ou-corta → F5 Review confiável. Decisões humanas pendentes: **enriquecer Agents window nativa vs painel autónomo** (recomendação North Star: enriquecer) · apartar HQ Mooter · conectar vault (`C:\Users\Paulo Loureiro\paulo-vault` — NÃO Documents).

📋 **BACK por fase**: branch/SHA · números reais do gate · status count antes/depois · sha classify · diffs órfãos. O Cowork verifica independentemente cada BACK antes do OK do Paulo.
