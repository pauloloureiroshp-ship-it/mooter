# ⇄ COWORK → CC · MASTERPROMPT — Aterrar Lingua Franca (#255) + construir camada-1 skills
> Budget: ≤8k tokens · id: cc-lf-land-skills-2026-07-17 · source: _handoff/MOOTER_SKILLS_MAP.md §5 (E4) +
> _handoff/MOOTER_PROJECT_ZERO_BLUEPRINT.md · confront git 2026-07-17 (Cowork)

📮 DESTINO: Claude Code · sessão FRESCA · Fase A na branch `origin/chore/moo-lingua-franca` (worktree
`../frugal-lf-verify`) → Fase B em worktree `../frugal-moo-skills` off `origin/main` PÓS-merge.

🎯 GOAL  Uma frente (subsistema Lingua Franca): (A) provar que #255 está merge-ready e entregar ao Paulo
         para merge nativo · (B) pós-merge, implementar as 5 skills da camada-1 como INTERFACES finas do
         canon — nunca duplicando o protocolo.

⏱️ WHEN  Agora. Fase B só arranca DEPOIS do Paulo mergear #255 (gate humano no meio, ver ⛔).

▶ DO — FASE 0 · Day-0 recon (REFUTA premissas antes de tocar em nada)
  Confirma estes factos que o Cowork mediu (não confies — reproduz):
  - `git log --oneline -1 origin/main` = `71340b2`? (#248/#249 dentro)
  - canon em main? `git show origin/main:docs/agent-context/AGENT_CONTEXT_PROTOCOL.md | grep -c "Lingua Franca v1"` → esperado **0**
  - canon na branch? idem em `origin/chore/moo-lingua-franca` → esperado **1**
  - mergeável limpo? `git merge-tree $(git merge-base origin/main origin/chore/moo-lingua-franca) origin/main origin/chore/moo-lingua-franca | grep -c "changed in both"` → esperado **0**
  - `index.lock` stale? remove só se git idle (gotcha conhecido). LISTA as premissas que refutaste, numeradas, antes de seguir.

▶ DO — FASE A · merge-insurance de #255 (worktree `../frugal-lf-verify` na branch LF)
  1. `sha256sum tools/router/classify.js` = `427d8c0b…` (drift = NO-SHIP).
  2. Suites que a branch toca + baseline: reporta contagens exatas ("tests pass" sem número = inválido).
     A branch adiciona `tools/handoff-preflight.test.js` (~513 linhas no diff) — corre-a.
  3. Spawn `final-reviewer-honest` (skill) sobre o diff `origin/main...origin/chore/moo-lingua-franca`
     com a allowlist dos 12 ficheiros (AGENTS.md · 4 templates · 5 fixtures · AGENT_CONTEXT_PROTOCOL.md ·
     handoff-preflight.js+test). Veredicto SHIP / SHIP-WITH-NITS / NO-SHIP verbatim no report.
  4. Emite HANDOFF ≤4k (template do próprio #255) com a linha merge-ready para o Paulo e `CCA: n/5` honesto.
  ⛔ STOP A → Paulo mergeia #255 nativo (irreversível = gate humano). NÃO force-push, NÃO mergees tu.

▶ DO — FASE B · camada-1 skills (worktree `../frugal-moo-skills` off main PÓS-merge)
  0. Gate de entrada mecânico: `grep -q "Lingua Franca v1" docs/agent-context/AGENT_CONTEXT_PROTOCOL.md`
     no main atual || STOP ("#255 ainda não em main — Paulo mergeia primeiro"). Sem isto, NÃO construas.
  1. Lê: MOOTER_SKILLS_MAP §3 (specs) · AGENT_CONTEXT_PROTOCOL §LF v1 · AGENTS.md §Pre-Dispatch Red-Team
     Gate · _handoff/templates/*.template.md + fixtures · tools/handoff-preflight.js (API: --out/--qa/
     --lint/--check, extractQA, lintHandoff). Método de skill: `skill-creator` (só como ferramenta).
  2. Ordem de dependência (uma skill = um dir `.claude/skills/<nome>/SKILL.md`, ≤60 linhas, trigger
     PT-BR+EN otimizada, corpo = passos do §3, refs `path:linha`, ZERO cópia de canon):
     moo-council → moo-handoff → moo-handoff-check → moo-masterprompt → moo-decision.
  3. moo-masterprompt e moo-decision terminam SEMPRE com o rodapé `📮 DESTINO` (regra de despacho, por
     referência a AGENTS.md §Communication — não recopiar).
  4. `wave-brief-compose/SKILL.md`: reduzir a ponteiro de deprecação → moo-masterprompt (preservar a
     herança "Day-0 recon que REFUTA premissas" citada lá).
  5. Valida: renderizar as 4 fixtures cd89b89c via as skills novas; `handoff-preflight --lint` verde nas
     saídas; `--check` verde.
  ⛔ STOP B → diff das 5 SKILL.md + o edit do wave-brief-compose ao Paulo antes do commit.

🔒 GUARD
  - classify.js FROZEN sha `427d8c0b…` (byte-idêntico) · git add SELETIVO (nunca -A) · sem .md novos na
    raiz · honest-copy (n/d, nunca palpite) · PT-BR conversa / EN identifiers · nomes próprios não traduzir.
  - Fase A allowlist: read-only + (só se final-reviewer achar nit) os 12 ficheiros da branch LF. Nada mais.
  - Fase B allowlist EXATA: `.claude/skills/{moo-council,moo-handoff,moo-handoff-check,moo-masterprompt,
    moo-decision}/**` (novos) + `.claude/skills/wave-brief-compose/SKILL.md` (1 edit). ZERO tools/**,
    ZERO packages/**, ZERO docs/**, ZERO canon (#255 é imutável aqui — reporta, não absorve).
  - ❌ NÃO tocar worktrees/ficheiros do Fleet/Mesh (em voo). ❌ NÃO auto-gerar skills do codebase
    (evidência SkillsBench 2026-07-17: −1.3pp) — skill = interface curada, não dump.

✅ GATE  docs-hygiene verde · 0 regressão nas suites existentes · Fase A: final-reviewer verbatim ·
         Fase B: fixtures lint-verdes + `--check` verde + final-reviewer antes do commit.

♻️ REUSE (confrontado 2026-07-17)
  1. Interno: `tools/handoff-preflight.js` + templates/fixtures do #255 — as skills SÓ orquestram; nada se
     reimplementa. wave-brief-compose absorvida com crédito.
  2. Público: gitagent-protocol (2.8k★) = identidade de agente, não mensagens tipadas · mattpocock/skills
     #306 = "handoff verification" PROPOSTO, não mergeado · superpowers/obra = metodologia em prosa, sem
     enforcement mecânico. Nada cobre o contrato repo-native+4-mensagens+verdade-git+gate-humano → construir.
  3. Waves: PERFECT_HANDOFF_SPEC.md + scaffold HANDOFF reusados por referência (path:linha).

⛔ STOP (resumo) A: Paulo mergeia #255. B: diff das skills ao Paulo. Qualquer coisa fora da allowlist ou
   tentação de editar canon → reporta, não faças.

⏭ NEXT  Project Zero (o `mooter init --auto` que instala AGENTS.md passivo + 2-3 skills certificadas no
         projeto do usuário) — frente SEPARADA, gated nesta + na Mesh C. NÃO tocar nesta sessão; existe só
         para saberes a trajetória. Detalhe: _handoff/MOOTER_PROJECT_ZERO_BLUEPRINT.md.

📋 BACK  HANDOFF tipado ≤4k (template #255) por fase: Fase A = merge-ready + veredicto final-reviewer +
         CCA n/5; Fase B = 5 skills + fixtures renderizadas + lint output. Refs path:linha, nunca dumps.

🔍 council 8/8 · objeção mais forte: "juntar 'aterrar #255' e 'construir skills' numa sessão arrisca a
Fase B começar antes do merge (a classe FC do PHASE_A_GATE)" · resolvida: o gate de entrada mecânico da
Fase B (grep do canon em main) é um STOP duro auto-verificável — sem canon em main, CC não constrói; o
merge nativo do Paulo no meio é o gate humano explícito, não uma suposição.
