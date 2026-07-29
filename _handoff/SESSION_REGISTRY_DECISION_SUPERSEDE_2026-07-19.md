---
type: DECISION
id: session-registry-supersede-20260719
from: cowork
to: repo (registro durável — fecha o HIGH-6 da auditoria audit-pre-merge-20260719)
severity: high
---
# ⇄ DECISION · Supersede do contrato do Session Registry (registro durável)

> Cowork · 2026-07-19 · Fecha o HIGH-6 da auditoria pré-merge do Codex: "o único contrato
> recuperado (`_handoff/SESSION_REGISTRY_MASTERPROMPT.md`) contradiz a arquitetura implementada;
> o masterprompt supersedente não está disponível para auditoria". Está agora.

## A cadeia de decisão (verbatim do ciclo, agora durável)

1. **Masterprompt supersedente** `session-registry-20260719` (Cowork → CC, 2026-07-19): allowlist
   restrita a NOVO `tools/router/session-registry.js` + `sessions.json` + testes + hook-subcomando;
   lease duro; NÃO alocou `agent-sync-ledger.js`.
2. **Divergência reportada pelo CC** (handoff `75b947c`): o spec base (2026-07-17) pedia
   session-start/end como eventos no Ledger; o masterprompt novo restringia o write-scope.
   O CC NÃO decidiu — reportou (correto).
3. **DECISION do Cowork, com autoridade do gate humano no fluxo** (`session-registry-close-20260719`):
   **STANDALONE ACEITO.** Fundamento arquitetural: liveness é estado MUTÁVEL (heartbeat reescreve
   `last_seen` continuamente); o Ledger é história IMUTÁVEL append-only — heartbeat no Ledger
   incharia exatamente o ficheiro que o Resume precisa ler rápido. `sessions.json` = presença/tranca;
   Ledger = história. Wave futura (que aloque `agent-sync-ledger.js` na allowlist) emite SÓ
   `session-start`/`session-close` como eventos duráveis — NUNCA heartbeat. Single-writer preservado
   dos dois lados. O herd-conductor futuro CONSOME este registry; nunca inventa lock próprio.

## Consequências pendentes (reconhecidas pela auditoria, roteadas)

- HIGH-2 (lease race: stale re-register + heartbeat sem revalidação) = BUG de implementação da
  decisão acima, não invalidação dela → remediação no CC (registry session).
- HIGH-3 (schema keyed-by-id vs array no context-card): **o Registry é o DONO canónico do schema**
  de `sessions.json` (single-writer define o formato); context-card adapta + teste de integração
  produtor→consumidor. Roteado ao Codex pós-fix do registry.
- `_handoff/SESSION_REGISTRY_MASTERPROMPT.md` (spec base 2026-07-17) fica SUPERSEDED por este
  documento na parte de arquitetura de store; o restante (campos, propósito) permanece válido.

📮 DESTINO: `_handoff/` (untracked até o housekeeping; entra no PR do registry) · auditoria
pode reproduzir: este doc + memória Cowork `project_mooter_empresa_de_um` §execução 07-18.
⇄ END
