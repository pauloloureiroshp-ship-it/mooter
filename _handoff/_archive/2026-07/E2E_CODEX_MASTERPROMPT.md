📥 COLAR EM: Codex · corrida FRESCA, worktree EFÉMERA dedicada (../frugal-e2e) — READ-ONLY, paralelo, zero colisão
🧩🔬 E2E-INTEGRAÇÃO · e2e-integracao-codex-20260720 · todas as branches integram juntas? (merge-sim total)
---
type: MASTERPROMPT
id: e2e-integracao-codex-20260720
from: cowork (brain)
to: codex
severity: high
generated_at: 2026-07-20
socio_pack: v1@manual (tier M)
role: AUDITOR read-only. Merge-sim + abort, nunca merge real.
---
⇄ COWORK → CODEX · MASTERPROMPT · E2E-INTEGRAÇÃO — a experiência inteira mergeia junto sem quebrar?

⇄ ACK OBRIGATÓRIO (≤5 linhas). Papel: auditor. Zero alteração de código de produção.

🧭 CONTEXTO: 6 branches formam a experiência E2E e nenhuma está em main. Antes de o Paulo mergear em
  sequência, provamos que o CONJUNTO integra sem conflito nem regressão — a validação E2E ao nível de código.

🎯 GOAL — READ-ONLY, worktree efémera:
  1. Confirma no object DB os tips: `feat/ledger-receipts@9ff1735` · `feat/vs-w1-semaforo@5599b55` ·
     `feat/mesh-phase-a@7d408f5` · `feat/fleet-metrics@5ddbb16` · `feat/moo-dispatch@41b3ae2` ·
     `feat/fleet-landing@d454b1d`(#257).
  2. **Merge-sim TOTAL numa worktree EFÉMERA:** `git merge --no-commit --no-ff` das 6 sobre
     `origin/main`, na ORDEM recomendada (receipts → vs-w1 → mesh → fleet-landing → fleet-metrics →
     moo-dispatch). Reporta: conflitos por par (quais branches colidem em que ficheiro?), e se a ordem
     resolve. `git merge --abort` + `git worktree remove` no fim.
  3. **Matriz de colisão:** tabela branch×branch com o(s) ficheiro(s) partilhado(s) (ex.: vs-w1 e
     moo-dispatch ambos tocam extension.js? fleet-metrics e fleet-landing ambos tocam fleet-orchestrator?).
     O brain já sabe que vs-w1↔receipts são disjuntos; TU cobres os outros 14 pares.
  4. **Suite integral pós-merge-sim total:** REDs novos vs baseline delimitado (gsd-statusline,
     tier-mix typecheck — pré-existentes). Zero RED novo = SHIP.
  5. **Ordem de merge final recomendada** com os conflitos que cada passo precisa resolver (se houver).
📍 WHERE  worktree EFÉMERA `../frugal-e2e` · fetch origin antes.
🛡 GUARD (endurecido)  READ-ONLY de código. Merge-sim = única escrita git, SÓ na efémera. Obrigatório:
  `git merge --abort` + `git worktree remove` + prova de zero-resíduo (`git worktree list` limpo, status
  da principal intocado). classify FROZEN (verificar). Única escrita = `_handoff/E2E_INTEGRATION_REPORT_2026-07-20.md`.
⚡ SE-ENTÃO  Conflito num par → achado nº1 (ficheiro + ordem que mitiga). RED novo → NO-SHIP com evidência.
  Se uma branch não existir no origin → n/d + qual. Se a efémera não remover → RED ALERT (resíduo).
❌ DO-NOT  Alterar produção · re-verificar o que o brain já fez (vs-w1↔receipts disjuntos) · merge/push
  real · "consertar" conflitos (reportas a ordem que os evita).
✅ GATE  6 tips confirmados · matriz de colisão completa (15 pares) · merge-sim total executado E abortado
  com zero-resíduo · REDs delimitados · ordem final recomendada · 🤝 SOCIO + council-mini.
📋 BACK  HANDOFF v1.1 ≤4k + `_handoff/E2E_INTEGRATION_REPORT_2026-07-20.md`: matriz de colisão, ordem de
  merge com conflitos por passo, REDs delimitados, veredicto SHIP/NO-SHIP do conjunto.
📮 DESTINO  Codex → BACK ao brain (moo-handoff-check) → dá ao Paulo a ordem de merge segura, auditada,
  para integrar a experiência E2E inteira sem surpresas.
