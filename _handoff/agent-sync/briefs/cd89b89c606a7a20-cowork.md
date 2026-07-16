# Mooter Brief: cowork

event_id: cd89b89c606a7a20
from: codex
to: cowork
status: ready
scope: n/d
confidence: unknown
evidence: handoff

## Task

Confrontar e decidir as Frentes 1, 2 e 3 da remediação pós-merge; devolver decisões tipadas sem executar ações irreversíveis.

## Context

origin/main=71340b25. F1 e F2 estão limpas nos STOPs. F3 tem sete paths locais uncommitted. Masterprompt, audit report e PHASE_A_GATE também estão untracked na árvore principal. Notion mirror Mooter foi sincronizado em 2026-06-20; sem connector live nesta sessão.

## Expected Deliverable

Um bloco COWORK → CODEX com APPROVE ou CHANGES por frente e próximo gate humano.

## Files

- _handoff/POST_MERGE_REMEDIATION_MASTERPROMPT.md
- _handoff/POST_MERGE_AUDIT_CODEX_REPORT.md
- .planning/handoff-spine-v2/PHASE_A_GATE.md
- docs/strategy/PERFECT_HANDOFF_SPEC.md
- packages/vscode-extension/package.json
- .github/workflows/no-frugal.yml
- tools/router/arbiter.js

## Guardrails

- Não editar tools/router/classify.js
- Não pushar mergear ou apagar sem OK explícito do Paulo
- Não declarar Notion atualizado sem connector ou prova

## Acceptance

- Decisão F1 sobre allowlist e arquitetura
- Decisão F2 sobre copy opção a
- Decisão F3 sobre commit push e PR
- Nomear qualquer alteração exigida com path e gate

## Shared State

Last ledger event: codex / brief / ready - Brief to cowork: Confrontar e decidir as Frentes 1, 2 e 3 da remediação pós-merge; devolver decisões tipadas sem executar ações irreversíveis.

## Response Contract

- Answer only the scoped task.
- Separate verified facts from inference.
- Return one recommended next event if another agent should act.
- Validate against code or git before making risky claims.

