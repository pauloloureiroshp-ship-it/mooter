# Charter — Pilar: skills

**Norte estrategico:** Criar e afiar skills que reduzem o custo medio por tarefa em >=10% sem perder qualidade no top-10 workflows.

## Objetivo
Skills automaticas que tornam o Mooter mais eficiente nos workflows mais frequentes dos utilizadores.

## Criterios de sucesso
- Custo medio top-10 workflows reduzido >= 10%
- Qualidade avaliada pelo council: >= baseline em 9/10 tasks
- Skills testadas antes de commit (smoke test por skill)

## Scope (worktree isolado)
`.claude/skills/`, `packs/`

## Out-of-scope
Routing engine (classify.js FROZEN), UI (pilar site)

## Reflexao continua
Cada skill nova inclui antes/depois do custo num case real.
