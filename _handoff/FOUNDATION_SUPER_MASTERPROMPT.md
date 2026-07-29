# ⇄ COWORK → CC · FOUNDATION SUPER MASTERPROMPT — o definitivo (cola e executa)
**2026-07-14 · CANÓNICO E FINAL.** Supersede TODOS os anteriores: `FOUNDATION_RESET_MASTERPROMPT{,_V2,_V2_1}.md`, `FOUNDATION_CONFRONTO_CODEX.md`, `CLAUDE_MD_PROPOSED_2026-07-12.md` (arquivar todos no PR da F4). Fundamento analítico: `_handoff/MOOTER_MASTER_ANALYSIS_2026-07-14.md` (ler; não re-litigar).
**Planejamento CONGELADO 2026-07-14 (decisão de sócios):** a partir daqui só execução; mudanças exigem novo gate humano explícito.
**Emenda 14b (gate: last check do Paulo):** reconciliação de roadmap — banner NOW na F1.5 + re-triagem completa W1-W16→pilares na F5. Motivo: existiam DOIS roadmaps vivos (MOOTER_ROADMAP.md v3 por squad × North Star F0-F5 por pilar).

## BOOT (30 segundos de contexto — depois execute)

**Tese (13-07):** Mooter = a experiência tipo Lovable para quem ultrapassou o Lovable — projetos reais, complexos, duradouros, multi-agente, no VS Code. Router = infra invisível. **5 pilares: Resume · Plan · Route · Watch · Review.** Régua: não melhora um dos 5 → não entra. Fosso (o que a MS nunca fará): local-first $0 · custo honesto · Resume 60s · neutralidade multi-vendor. Montar no carril nativo (Agents window), nunca competir na casca.
**Conclusão económica (Master Analysis):** custo/token é provado mas erode (wedge); **tempo (Resume) é o benefício que não erode e nunca foi medido** — por isso a ordem spine→Resume é inegociável.
**Números honestos para QUALQUER texto público:** envelope 65-82% vs all-Opus · 47% em 658 calls reais (06-08) · −59.3% no bench N=12 a 4.7pp do Oracle (06-27) · 82.7% numa sessão real (06-06). **NUNCA "~90%".**

🔒 **GUARD (violar = ABORT)**
1. `tools/router/classify.js` FROZEN — sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` intacto em todo commit.
2. `git add` seletivo SEMPRE (nunca `-A`). Push/merge/delete/deploy = só com OK do Paulo nos ⛔ STOPs.
3. Toda fase ≥F1.5 em **worktree fresco de `origin/main`** (`git fetch origin` primeiro). A árvore principal só é tocada na F1 (read-only + commit em branch backup).
4. Nada se apaga: `_to_delete/foundation-2026-07-14/` ou arquivo com tag. Não tocar em worktree com sessão ativa (mtime de `.git/worktrees/*/index` < 24h → não mexer).
5. SYNC.md 📥 fica 🟡 até o spine fechar. Handoff: fatos = git plumbing determinístico; narrativa = local best-effort; incerto = `n/d`, nunca palpite.
6. Antes de empacotar/commitar extensão: `node --check` no `extension.js` E no extraído do `.vsix` (size = source); `node --test` COMPLETO incl. `webview-syntax`.
7. ⏱ **Timebox: F3→F6 fecham em ≤7 dias corridos do 1º commit da F3.** Dia 7 = o que restar vai pro arquivo sem culpa (o snapshot protege).

---

## F0.5 — TESTE DO AMIGO · BASELINE (paralelo, não bloqueia; Paulo-hands + Cowork)
Instalar o Mooter atual (de main/tag, nunca de branch) em: (a) 1 amigo vibe coder e (b) **1 máquina SEM GPU/CUDA**. Cronometrar: minutos até instalar · onde quebrou · time-to-first-action manual ("voltei ao projeto — quanto demoro até saber o que fazer?") · voltou no dia seguinte? **Expectativa: falhar — o objetivo é medir ONDE.** → `docs/strategy/FRIEND_TEST_BASELINE_2026-07.md` (números crus). Re-rodar ao fim de cada fase do North Star. ⚠ Decisão Paulo pendente: arbiter Haiku OFF por default neste build (recomendado — protege a marca até o P0 privacidade fechar).

## F1 — SNAPSHOT FORENSE (idempotente: se `backup/tree-snapshot-*` existir, validar e pular)
Na árvore principal (`~/frugal`, `wave/honest-controls`, ~440 dirty):
1. `git checkout -b backup/tree-snapshot-2026-07-14`
2. Commits em lotes nomeados (EXCLUIR os ~243 temp de `scripts/` — prefixos lec-/leq-/lecw-/lp-*/lpa-/lpsk-/le-task-snap-/node-compile-cache):
   - **M-code**: M de `tools/router/ packages/ landing/`
   - **M-canon**: `AGENTS.md CLAUDE.md SYNC.md GEMINI.md mooter.code-workspace package.json package-lock.json docs/strategy/PERFECT_HANDOFF_SPEC.md` + M de `_handoff/`
   - **docs-novos**: untracked de `docs/` + `packages/vscode-extension/src/lp-aggregates.*` + `tools/docs-hygiene.*` + `tools/router/quota-{live,status}.js`
   - **LOTE G**: `GEMINI.md .ai/ .gemini/ .codex/ docs/AGENT_HANDOFF.md scripts/setup-gemini-vscode.* scripts/diag-gemini-env.*` + copiar `../frugal-w2/docs/ai/AI_SETUP_SUMMARY.md` → `docs/ai/`
   - **handoff-vivo**: untracked de `_handoff/` que sejam .md de waves vivas (lp-coerencia, LP_H2, FOUNDATION_*, MOOTER_MASTER_ANALYSIS)
3. `git checkout wave/honest-controls` — confirmar working tree igual (dirty se mantém; snapshot é cópia).
4. 📸 Registrar o "antes" em `docs/strategy/FOUNDATION_BEFORE_AFTER.md` (dirty/PRs/branches/worktrees/stashes) — primeiro material do pilar Resume.
⛔ STOP: `git log --stat` do backup → OK Paulo → push. ✅ Gate: backup no origin · tree inalterada · sha intacto.

## F1.5 — PR DA RÉGUA (a maior alavanca; worktree `../frugal-regua` de origin/main, branch `chore/tese-v2`)
Atualizar SÓ os parágrafos de tese e claims públicos:
- `AGENTS.md` §Project overview (l.8-12) → tese nova (5 pilares + fosso + router-como-infra).
- `docs/strategy/MOOTER_ROADMAP.md` §"A tese" → idem; régua de wave = 5 pilares. **E banner NOW no topo:** "NOW = `_handoff/FOUNDATION_SUPER_MASTERPROMPT.md` → North Star F0-F5 (Notion 13-07, por pilar). As waves W1-W16 abaixo aguardam re-triagem (F5) — não iniciar wave desta lista sem re-triagem." (Mata o segundo-roadmap-vivo já; o remap completo é na F5.)
- `CLAUDE.md` header → idem (bloco completo novo fica p/ F3-E′).
- **`README.md` primeira dobra (OBRIGATÓRIO — verificado 14-07):** tagline/tese nova · **remover "~90% cost savings validated on 1,437 real prompts"** → envelope honesto "65-82% vs all-Opus (measured; see dated sources)" linkando `SYSTEM_DESIGN.md §0` e `MOOTER_PERF_VALIDATION.md` · badge de versão real (não v1.15.0). Copy profunda fica p/ North Star F0.
⛔ STOP: diff → OK Paulo → push + PR. ✅ Gate: `grep -ri "your llm router\|~90%" AGENTS.md CLAUDE.md README.md docs/strategy/MOOTER_ROADMAP.md` = 0 hits problemáticos no branch.

## F2 — SPINE V2 FASE A ATERRA (fundação do Resume)
Packet `_handoff/WAVE_HANDOFF_SPINE_V2_MASTERPROMPT.md` + decisões do gate 10-07: fechar os 3 nits P2 → re-Gate A completo (docs-hygiene 4/4 · doctor error=0 · ledger 23/23 · router · vscode full) → push (já autorizado) → PR padrão #237 → ⛔ merge é do Paulo. Spine Fases B-F ≡ North Star F0 (lock SYNC · reducer único · matar `wave ship --force` · auto-lock bloqueante · buffer separado) — mesma frente daqui em diante.

## F3 — TRIAGEM FORENSE DOS M (⏱ dias 1-4; worktree fresco pós-F1.5)
Por ficheiro M: diff → casar com handoff de origem → lote → branch `chore/foundation-<lote>` → teste da área verde → PR pequeno:
- **A flicker-fix** (4 files, allowlist 10-07, provado 0-flashes) → 1º PR.
- **B router extras** (chip-composer · gsd-statusline · ledger-decision+test · router package.json) — identificar wave ANTES de commitar.
- **C vscode-extension** (extension.js · host-extra.js · handoff-accumulator.test.js + lp-aggregates.*) — ⚠ confrontar com spine A e com o que já aterrou via #245.
- **D landing** (3 files) · **E canónicos** + **E′ CLAUDE.md v2** (enxuto; não duplica AGENTS.md; secção "Session discipline": worktree-por-sessão · boot = North Star + SYNC 📥 · build/package só de main/tag · testes → `os.tmpdir()` · uncommitted aterra no dia) · **F docs novos** · **G Gemini/IA** (do snapshot → PR).
- **Resgate**: cherry-pick `28fe2e5` + `eba5d3b` de `wave/honest-controls` → PR próprio → depois tag `archive/honest-controls` + delete (OK Paulo).
⛔ STOP por lote. ✅ Gate: árvore principal 0 M · diff órfão = REPORTAR, nunca commitar. Dia 4: o que restar → arquivo.

## F4 — LIXO + CAUSA-RAIZ (⏱ dias 4-5)
243 temp de `scripts/` → `_to_delete/` com manifest · achar o(s) teste(s) que escrevem em `scripts/` → `os.tmpdir()` (prova: suite roda, `git status` limpo) · `.gitignore` com prefixos específicos · `outside-secret.txt` fora · `no-frugal ratchet`: baseline OU remover required (⛔ decisão Paulo — vermelho crónico proibido) · doctor `--strict` → `_handoff/` topo arquivado em `_archive/2026-07/` incl. `_MASTER_ORCHESTRATION.md` (já se auto-declara superseded) e TODOS os masterprompts supersedidos por este · **este ficheiro arquiva-se no mesmo PR**.
✅ Gate: `git status` ≤ 5 · doctor strict exit 0 · CI sem vermelho crónico.

## F5 — DEFAULT-ARCHIVE (⏱ dia 6)
Default = arquivar TUDO: 24 PRs (fechar c/ comentário "superseded pela tese 2026-07-13") · 61 branches sem upstream (tag `archive/<nome>` + delete) · 8 stashes (drenar: branch de arquivo ou drop pós-inspeção). **Keep-list ≤6**, cada item defendido pela régua 5-pilares/4-fossos — candidatos: #233 quota (Route) · #229 eval (Review) · #225 moo-loop (Watch) · #244 MEO polish (Watch; resolver colisão de versão c/ #245) · PR do spine · PR do flicker. Council: arquivar sem merge (−84k a −100k linhas, já decidido). **Outputs extra (mesmo PR):** (a) coluna `core | frozen | parked` por órgão em `MOOTER_ARCHITECTURE.md §1` — órgão parked não recebe wave até os 5 pilares fecharem; (b) **`MOOTER_ROADMAP.md` re-triado — UMA só fonte de roadmap**: cada wave W1-W16 → pilar (Resume/Plan/Route/Watch/Review) ou `parked`; W13/W15/W16 (Delivery Cockpit · CTO Deck · Live Preview build-cinema) marcadas **absorvidas pelo North Star F2/F5** (não são waves próprias — são o mesmo trabalho sob a espinha nova); W4/W5/W7/W9 (auto-evolution) ficam gated pelo drift check claim-vs-prova; W8/W10/W11/W12 = frontier parked.
⛔ STOP: keep-list → OK Paulo → execução em lote.

## F6 — WORKTREES (⏱ dia 7)
Script host: por worktree → uncommitted? branch merged? última atividade → podar limpos+merged (7 já aprovados no SYNC 07-07) → `git worktree prune`. Meta: **WIP 3-5, nunca 17**. Manter ativos + `frugal-w2` (servers).

## F7 — GUARDRAILS (liga no fim; é o "nunca mais")
1. doctor `--strict` required no CI · 2. CLAUDE.md v2: worktree-por-sessão + build só de main/tag · 3. Drift checks: instalado-vs-git (vsix) · classifier-vs-executor (registry fail-closed) · copy-vs-runtime (privacy) · tese-vs-canon (grep=0) · **claim-vs-prova** ("learns forever" e % públicos só com evidência datada linkada; #239 adaptive só default-on com A/B provado) · 4. Recon semanal Cowork (dirty/PRs/branches/worktrees/stashes + "todo marco tem Notion+vault?" + re-rodar friend test por fase) · 5. WIP cap 3-5 · 6. Higiene por LLM local = doctor detecta + moos propõem em PR gated, nunca escrita autônoma · 7. 📸 completar `FOUNDATION_BEFORE_AFTER.md` (o "depois") · 8. Instrumentar `time_to_first_action` no Ledger (spec no North Star F1) — o benefício-tempo passa a ser medido, não citado.

## DEPOIS (não é deste prompt): North Star F0-F5
F0 "Não mentir" (5 P1 via spine B-F · privacy/data-policy · testes plugin 8→≥60 · SYNC não corrompe c/ 3 sessões) → F1 Resume 60s → F2 Watch enxuto → F3 Route invisível → F4 Plan-ou-corta → F5 Review confiável. Decisões Paulo pendentes: enriquecer Agents window vs autónomo (recomendado: enriquecer) · arbiter default do build do amigo · renomear `worktree-conductor` (MS lançou "Conductor" 05-26) · apartar HQ Mooter · conectar vault (`C:\Users\Paulo Loureiro\paulo-vault`).

📋 **BACK por fase (colar no Cowork):** branch/SHA · números reais do gate · `git status --porcelain | wc -l` antes/depois · sha classify · órfãos · dias consumidos do timebox. O Cowork verifica independentemente cada BACK (git plumbing read-only) antes do OK do Paulo. Nunca dizer "limpo/✅" sem ser verdade; incerto = `n/d`.
