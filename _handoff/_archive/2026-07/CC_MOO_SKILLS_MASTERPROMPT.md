# ⇄ COWORK → CC · MASTERPROMPT — camada-1 skills (interfaces do canon Lingua Franca)
> Budget: ≤8k · id: cc-moo-skills-2026-07-17 · source: _handoff/MOOTER_SKILLS_MAP.md §3+§5 ·
> confront git 2026-07-17 (main @71340b2 · #255 clean-mergeable · main checkout em chore/mooter-20-h0)

📮 DESTINO: Claude Code · sessão FRESCA · worktree NOVO `../frugal-moo-skills` off `origin/main`.
   PRÉ-CONDIÇÃO: o Paulo já mergeou o #255 (Lingua Franca) em main. Sem isso, o gate de entrada faz STOP.

🎯 GOAL  Implementar as 5 skills da camada-1 como INTERFACES finas (≤60 linhas cada) do canon Lingua
         Franca já em main — NUNCA duplicando o protocolo. Design já fechado no source; isto é execução.

▶ DO — FASE 0 · Day-0 (REFUTA premissas antes de tocar; NÃO trabalhes na pasta principal `frugal\`)
  1. `git fetch origin` (nativo).
  2. GATE DE ENTRADA (duro): `grep -q "Lingua Franca v1" <(git show origin/main:docs/agent-context/AGENT_CONTEXT_PROTOCOL.md)`
     || STOP → "#255 ainda não está em main; Paulo mergeia primeiro". Sem o canon em main, NÃO construas.
  3. Cria o worktree: `git worktree add ../frugal-moo-skills origin/main` e trabalha SÓ aí (1 sessão = 1 worktree).
  4. `sha256sum tools/router/classify.js` = `427d8c0b…` (drift = STOP).
  5. Lista as premissas que refutaste, numeradas.

▶ DO — FASE 1 · construir as 5 skills (ordem de dependência; 1 skill = 1 dir `.claude/skills/<nome>/SKILL.md`)
  Lê primeiro: MOOTER_SKILLS_MAP §3 (as specs completas) · docs/agent-context/AGENT_CONTEXT_PROTOCOL.md
  §LF v1 · AGENTS.md §Pre-Dispatch Red-Team Gate · _handoff/templates/*.template.md + fixtures ·
  tools/handoff-preflight.js (API: --out/--qa/--lint/--check, extractQA, lintHandoff). Ferramenta: skill-creator.
  Cada SKILL.md: ≤60 linhas · frontmatter name+description (trigger PT-BR+EN otimizada, estilo skill-creator) ·
  corpo = passos do §3 · refs `path:linha` para o canon · ZERO cópia do protocolo.
    1. moo-council        (folha; as 8 perguntas lidas de AGENTS.md, nunca hardcoded; canon ausente → n/d, nunca 8/8)
    2. moo-handoff        (orquestra handoff-preflight: --out → TODOs de julgamento → --qa → rodapés → --lint)
    3. moo-handoff-check  (lint + confront-before-accept + red-flags de fabricação [caso Gemini 07-17] + rubrica)
    4. moo-masterprompt   (template MASTERPROMPT + REUSE 3-perguntas + council + rodapé 📮 DESTINO obrigatório)
    5. moo-decision       (extractQA verbatim → tabela decision/verdict + council + 📮 DESTINO)
  Depois: `.claude/skills/wave-brief-compose/SKILL.md` → reduzir a ponteiro de deprecação p/ moo-masterprompt
  (preservar a herança "Day-0 recon que REFUTA premissas" citada lá).

▶ DO — FASE 2 · validar
  Renderizar as 4 fixtures `cd89b89c…` via as skills novas · `node tools/handoff-preflight.js --lint <saídas>`
  verde · `--check` verde · spawn `final-reviewer-honest` (skill) sobre o diff, veredicto verbatim.

🔒 GUARD
  - classify.js FROZEN sha `427d8c0b…` byte-idêntico · git add SELETIVO (nunca -A) · sem .md novos na raiz ·
    honest-copy (n/d nunca palpite) · PT-BR conversa / EN identifiers · nomes próprios não traduzir.
  - Allowlist EXATA: `.claude/skills/{moo-council,moo-handoff,moo-handoff-check,moo-masterprompt,moo-decision}/**`
    (novos) + `.claude/skills/wave-brief-compose/SKILL.md` (1 edit). ZERO tools/**, packages/**, docs/**, canon.
  - Canon (#255 em main) é IMUTÁVEL aqui — divergência = reporta, não absorve.
  - ❌ NÃO tocar worktrees/ficheiros do Fleet/Mesh/mooter-20 (em voo). ❌ NÃO auto-gerar skills do codebase
    (SkillsBench 2026-07-17: −1.3pp) — skill = interface curada, não dump. ❌ NÃO merge/push (gate Paulo).

✅ GATE  docs-hygiene verde · 0 regressão nas suites existentes · fixtures lint-verdes · `--check` verde ·
         final-reviewer-honest SHIP/SHIP-WITH-NITS antes de propor commit (contagens de teste verbatim).

♻️ REUSE (confrontado 2026-07-17)
  1. Interno: handoff-preflight.js + templates/fixtures do #255 — as skills SÓ orquestram; wave-brief-compose absorvida c/ crédito.
  2. Público: gitagent-protocol=identidade (não mensagens) · mattpocock/skills#306=proposto, não mergeado ·
     superpowers/obra=prosa sem enforcement. Nada cobre repo-native+4-mensagens+verdade-git+gate-humano → construir.
  3. Waves: PERFECT_HANDOFF_SPEC.md + scaffold HANDOFF por referência.

⛔ STOP  Diff das 5 SKILL.md + o edit do wave-brief-compose ao Paulo ANTES de qualquer commit. Nada fora da
         allowlist. Merge/push nunca (gate Paulo).

⏭ NEXT  Project Zero (`mooter init --auto` que instala AGENTS.md passivo + 2-3 skills certificadas no projeto
         do usuário) — frente SEPARADA, gated nesta + na Mesh C. NÃO tocar. Detalhe: _handoff/MOOTER_PROJECT_ZERO_BLUEPRINT.md.

📋 BACK  HANDOFF tipado ≤4k (template do #255): 5 skills + fixtures renderizadas + lint output + veredicto
         final-reviewer + CCA n/5 honesto. Refs path:linha, nunca dumps.

🔍 council 8/8 · objeção mais forte: "sessão fresca sem o contexto da conversa pode reimplementar lógica que
já vive no handoff-preflight" · resolvida: a Fase 1 obriga a ler o preflight.js e o §3 antes de escrever, e a
allowlist proíbe tocar tools/** — as skills só podem orquestrar o que já existe, não reescrever.
