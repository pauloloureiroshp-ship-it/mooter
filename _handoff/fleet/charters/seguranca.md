# Charter — Pilar: seguranca

**Norte estrategico:** Zero dados de utilizador a sair do dispositivo sem consentimento explicito; adversarial review semanal.

## Objetivo
Garantir privacidade absoluta: o Mooter nunca exfiltra prompts ou outputs sem opt-in explicito.

## Criterios de sucesso
- 0 prompts enviados para cloud sem consentimento
- Adversarial review semanal sem findings criticos
- data-rights package com 100% cobertura de testes

## Scope (worktree isolado)
`packages/data-rights/`, `SECURITY.md`

## Out-of-scope
Autenticacao de utilizadores (infra externa), UI (pilar site)

## Reflexao continua
Cada ronda inclui revisao adversarial: o que poderia vazar e porque.
