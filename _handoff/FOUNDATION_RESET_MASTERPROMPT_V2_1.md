# ⇄ COWORK → CC · FOUNDATION RESET V2.1 — fundação impecável sob a TESE NOVA, com relógio e espelho de mercado
**2026-07-14 · SUPERSEDE:** `FOUNDATION_RESET_MASTERPROMPT_V2.md` (e, por herança, MASTERPROMPT v1 + CONFRONTO_CODEX + CLAUDE_MD_PROPOSED) — arquivar os 4 no PR da F4, junto com este.
**Boot obrigatório:** Notion "🧭 Estado Atual & North Star · 2026-07-13" (sob Mooter HQ) — é a régua de tudo.
**Delta V2→V2.1 (emendas de sócio, aprovadas pelo Paulo 2026-07-14):** ⏱ timebox F3→F6 = 1 semana · 🧪 F0.5 teste-do-amigo baseline · 🗄 F5 vira default-archive (keep-list ≤6) · 📸 before/after do recon guardado como material do pilar Resume.

🎯 **GOAL** Zerar a dívida operacional (437 dirty · 24 PRs · 179 branches · 39 worktrees · 8 stashes) sem perder um byte, realinhar o canon à tese nova, e sair com **um dado de mercado** (baseline do teste do amigo) — em ≤1 semana após o início da F3.

## A TESE (mudou 2026-07-13 — decore antes de qualquer commit)

Mooter **não é** essencialmente um router. É **a experiência tipo Lovable para quem ultrapassou o Lovable**: projetos reais, complexos e duradouros, multi-agente, dentro do VS Code. Router = infraestrutura invisível. **5 pilares**: Resume · Plan · Route · Watch · Review. Régua brutal: *não melhora um dos 5 → não entra agora.* Fosso (o que a Microsoft nunca fará): roteamento local-first $0 · custo honesto por sessão · Resume de 60s · neutralidade multi-vendor com local. Não competir na casca da Agents window nativa — montar nela. Frame comercial: não vencemos a categoria, vencemos o segmento — **a única coisa que um graduado de Lovable instala em cima do carril nativo**.

🔒 **GUARD** (violar = ABORT)
- `tools/router/classify.js` FROZEN — sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` intacto em todo commit.
- `git add` seletivo SEMPRE; `git add -A` proibido. Push/merge/delete só com OK do Paulo (⛔ STOPs).
- Nada se apaga: mover p/ `_to_delete/foundation-2026-07-14/` ou arquivar (tag antes de delete de branch).
- Não tocar em worktrees com sessão ativa (verificar mtime dos index em `.git/worktrees/*/`).
- SYNC.md 📥 fica 🟡 até o spine V2 fechar. Fatos de handoff = determinísticos (git plumbing); narrativa = local LLM best-effort — nunca o contrário.
- ⏱ **Relógio:** F3→F6 fecham em ≤7 dias corridos a partir do 1º commit da F3. Dia 7: o que não foi triado fica no snapshot (F1) e é arquivado sem culpa. Perfeccionismo de limpeza = procrastinação de mercado.

## F0.5 — TESTE DO AMIGO · BASELINE (novo; paralelo, não bloqueia nada; Paulo-hands + Cowork)

Instalar o Mooter atual (v0.16.66, de main/tag — nunca de branch) na máquina de 1 amigo vibe coder. Cronometrar e documentar friamente: minutos até instalar · o que quebrou · o que ele não entendeu · se voltou no dia seguinte. **Expectativa honesta: vai falhar — o objetivo é medir ONDE.** Resultado vira `docs/strategy/FRIEND_TEST_BASELINE_2026-07.md` (números reais, zero enfeite) e é re-rodado ao fim de cada fase F0-F5 do North Star. Este é o único instrumento que converte "tem muito valor pra mim" em dado de mercado.

## F1 — SNAPSHOT FORENSE (idempotente: se `backup/tree-snapshot-*` já existir, validar e pular)

1. Na árvore principal (`~/frugal`, `wave/honest-controls`): `git checkout -b backup/tree-snapshot-2026-07-14`.
2. Commits em LOTES NOMEADOS (sem os ~243 temp de `scripts/`):
   - **M-code**: os M de `tools/router/`, `packages/`, `landing/` → `wip(snapshot): M code — triagem na F3`
   - **M-canon**: `AGENTS.md CLAUDE.md SYNC.md GEMINI.md mooter.code-workspace package.json package-lock.json docs/strategy/PERFECT_HANDOFF_SPEC.md` + M de `_handoff/`
   - **docs-novos**: untracked de `docs/` + `lp-aggregates.js`+test + `tools/docs-hygiene.*` + `quota-live/quota-status.js`
   - **LOTE G**: `GEMINI.md .ai/ .gemini/ .codex/ docs/AGENT_HANDOFF.md scripts/setup-gemini-vscode.* scripts/diag-gemini-env.*` + copiar `../frugal-w2/docs/ai/AI_SETUP_SUMMARY.md` → `docs/ai/`
3. `git checkout wave/honest-controls` (working tree volta dirty — snapshot é cópia, não mudança).
4. 📸 Guardar o output do recon (dirty count, PRs, branches, worktrees, stashes) em `docs/strategy/FOUNDATION_BEFORE_AFTER.md` — o "antes" do primeiro demo do pilar Resume.
⛔ **STOP F1**: `git log --stat` do backup → OK Paulo → push. ✅ Gate: backup no origin · tree inalterada · sha classify intacto.

## F1.5 — PR DA RÉGUA (maior alavanca — ANTES de tudo o resto)

Worktree fresco: `git fetch origin && git worktree add ../frugal-regua origin/main -b chore/tese-v2`.
Atualizar APENAS os parágrafos de tese: `AGENTS.md` §Project overview (l.8-12) · `docs/strategy/MOOTER_ROADMAP.md` §"A tese" · `CLAUDE.md` header · `README.md` primeira dobra SE router-first. Nada mais.
⛔ **STOP F1.5**: diff → OK Paulo → push + PR. ✅ Gate: `grep -ri "your llm router" AGENTS.md CLAUDE.md docs/strategy/MOOTER_ROADMAP.md` = 0 no branch.

## F2 — SPINE V2 FASE A ATERRA (fundação do pilar Resume)

Packet `_handoff/WAVE_HANDOFF_SPINE_V2_MASTERPROMPT.md`, decisões do gate 10-07: fechar 3 nits P2 → re-Gate A completo → push (autorizado) → PR padrão #237 → ⛔ merge é do Paulo. Spine Fases B-F ≡ North Star F0 (lock no SYNC, reducer, matar `wave ship --force`, auto-lock, buffer) — mesma frente daqui em diante.

## F3 — TRIAGEM FORENSE DOS M (⏱ dias 1-4 da semana)

Worktree fresco de origin/main pós-F1.5. Por ficheiro: diff → casar com handoff de origem → lotes:
- **A flicker-fix** (allowlist 10-07, provado): `backtest.js vram_detect.js runner.mjs benchmark.mjs` → 1º PR.
- **B router extras** · **C vscode-extension** (⚠ sobreposição com spine A / lp-coerencia / #245) · **D landing** · **E canónicos** (inclui **E′**: CLAUDE.md v2 enxuto — sem duplicar AGENTS.md, secção "Session discipline": worktree-por-sessão · boot SYNC 📥 · build só de main/tag · testes → os.tmpdir · uncommitted aterra no dia) · **F docs novos** · **G Gemini/IA**.
- **Resgate**: cherry-pick `28fe2e5` + `eba5d3b` de `wave/honest-controls` → PR próprio; depois tag `archive/honest-controls` + delete (decisão Paulo).
⛔ STOP por lote. ✅ Gate: árvore principal com 0 M · diff órfão = reportar, não commitar. **Dia 4 sem terminar → o que resta vai direto pro arquivo (está no snapshot).**

## F4 — LIXO + CAUSA-RAIZ (⏱ dias 4-5)

243 temp de `scripts/` → `_to_delete/` com manifest · teste que escreve em `scripts/` → `os.tmpdir()` (prova: suite roda, `git status` limpo) · gitignore específico · `outside-secret.txt` fora · `no-frugal ratchet`: baseline OU remover required (decisão Paulo) · doctor `--strict` → `_handoff/` topo arquivado em `_archive/2026-07/` (manter waves vivas) · **este masterprompt + os 4 supersedidos arquivam-se neste PR**.
✅ Gate: `git status` ≤ 5 · doctor strict exit 0 · CI sem vermelho crónico.

## F5 — DEFAULT-ARCHIVE (⏱ dia 6; era "matriz", mudou)

**Regra nova: o default é arquivar TUDO** — 24 PRs (fechar com tag/comentário "superseded pela tese 2026-07-13"), 61 branches sem upstream (tag `archive/<nome>` + delete), 8 stashes (drenar: aplicar em branch de arquivo ou drop após inspeção). **Só sobrevive o que entrar na keep-list (≤6 itens), defendido pela régua dos 5 pilares/4 fossos.** Candidatos à keep-list (Cowork recomenda, Paulo bate o martelo): #233 quota-aware (Route) · #229 eval harness (Review) · #225 moo-loop (Watch) · #244 MEO polish (Watch — resolver colisão de versão c/ #245) · spine PR da F2 · flicker PR da F3-A. Council: arquivar sem merge (já decidido, −84k linhas). Ónus da prova é de quem fica, não de quem sai — tudo é reversível por tag.

## F6 — WORKTREES (⏱ dia 7)

Script host: uncommitted + branch + merged? por worktree → podar limpos+merged → `git worktree prune`. Meta: **WIP 3-5 sessões, nunca 17**. Manter ativos + w2 (servers).

## F7 — GUARDRAILS "nunca mais" (contínuo, liga no fim da semana)

1. doctor `--strict` required no CI · 2. CLAUDE.md: sessão NUNCA na árvore principal; build/package só de main/tag · 3. Drift checks: instalado-vs-git · classifier-vs-executor · copy-vs-runtime · tese-vs-canon (grep router-first = 0) · 4. Recon semanal Cowork (dirty/PRs/branches/worktrees/stashes + "todo marco tem Notion+vault?" + **re-rodar teste do amigo a cada fase North Star**) · 5. WIP cap 3-5 · 6. Higiene local-LLM = doctor detecta + moos propõem em PR gated, nunca escrita autônoma. · 7. 📸 Completar `FOUNDATION_BEFORE_AFTER.md` com o "depois" — primeiro material de história do pilar Resume ("o Mooter te diz em 60s o que 437 ficheiros sujos escondiam").

## DEPOIS DA FUNDAÇÃO → North Star F0-F5

F0 "Não mentir" (5 gates P1 via spine B-F · privacy/data-policy · testes plugin 8→≥60 · SYNC não corrompe c/ 3 sessões) → F1 Resume 60s → F2 Watch enxuto → F3 Route invisível → F4 Plan-ou-corta → F5 Review confiável — **cada fase re-mede o teste do amigo**. Decisões humanas pendentes: enriquecer Agents window vs autónomo (recomendação: enriquecer) · apartar HQ · vault (`C:\Users\Paulo Loureiro\paulo-vault`). Moove (importador Lovable) = ás de distribuição, parked até o Resume funcionar.

📋 **BACK por fase**: branch/SHA · números reais do gate · status count antes/depois · sha classify · órfãos · dias consumidos do timebox. O Cowork verifica independentemente cada BACK antes do OK do Paulo.
