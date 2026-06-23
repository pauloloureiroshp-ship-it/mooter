# Charter — Pilar: vscode-plugin

**Norte estrategico:** Entregar o cockpit VSCode com statusline fiel, routing inline e zero friccao de instalacao.

## Objetivo
Plugin VSCode que mostra o tier badge, savings reais e routing live — instalavel em <2 min.

## Criterios de sucesso
- Instalacao via VSIX em <2 min sem configuracao manual
- Statusline atualiza em <200 ms apos cada prompt
- Zero crashes em 100 prompts consecutivos

## Scope (worktree isolado)
`packages/vscode-extension/`

## Out-of-scope
Runtime do classifier (pilar matriz), UI web (pilar site)

## Reflexao continua
Log de erros por ronda; qualquer crash = reverter + raiz de causa antes de avancar.
