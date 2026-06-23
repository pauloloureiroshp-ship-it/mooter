# Charter — Pilar: statusline

**Norte estrategico:** Manter o statusline como painel de controlo fiel: savings reais, tier badge honesto, latencia <50ms.

## Objetivo
Statusline sempre honesto e ultra-rapido — o espelho fiel do que o Mooter esta a fazer.

## Criterios de sucesso
- Savings calculados de forma honesta (sem inflacao)
- Tier badge correto em 100% dos casos (validado por unit tests)
- Render latencia < 50 ms

## Scope (worktree isolado)
`tools/router/statusline-hooks.js`, `tools/router/statusline.js`

## Out-of-scope
Classify engine (FROZEN), cockpit VSCode (pilar vscode-plugin)

## Reflexao continua
Qualquer mudanca de calculo exige comparacao com valor anterior no mesmo conjunto de dados.
