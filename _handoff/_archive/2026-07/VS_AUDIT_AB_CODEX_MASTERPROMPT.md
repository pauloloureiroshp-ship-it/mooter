📥 COLAR EM: Codex · corrida FRESCA, worktree EFÉMERA dedicada (../frugal-audit) — READ-ONLY, paralelo aos merges, zero colisão
🔬🅰️🅱️ VS-AUDIT-AB v2 · vs-audit-ab-codex-20260719 · A/B empírico do savings (foco) + merge-sim conjunto
---
type: HANDOFF-REQUEST
id: vs-audit-ab-codex-20260719
from: cowork (brain)
to: codex
severity: high
generated_at: 2026-07-19
socio_pack: v1@manual (tier M)
role: AUDITOR read-only (perfil validado: LP audit, Mesh U2). NÃO implementa.
revisao: v2 — enxugado (o brain já confirmou sha+allowlists no object DB); foco no A/B; guard do merge-sim endurecido
---
⇄ COWORK → CODEX · MASTERPROMPT · VS-AUDIT-AB — a PROVA do D1 + o único delta de merge que falta

⇄ ACK OBRIGATÓRIO (≤5 linhas, nas TUAS palavras). Papel: auditor. Zero alteração de código de produção.

🧭 CONTEXTO: o brain JÁ verificou no object DB: vs-w1 @782b8df (sha ok, split G1 correto) e
  ledger-receipts @9ff1735 (computeSavingsReceipt com clamp, classify frozen). NÃO repitas isso.
  Ficam 2 coisas que só TU podes provar em paralelo, read-only:

🎯 GOAL — 2 blocos, B é o principal:
  **B (PRINCIPAL) · A/B EMPÍRICO DO SAVINGS — a prova do D1 com dado REAL:**
   B1. Sobre o ledger/telemetria REAL da máquina, computa o savings pelo caminho NOVO
       (`computeSavingsReceipt()` · savings-tracker.js:140-160): routing_advisory (Cockpit) e
       execution_receipt (Control), com saved_usd (clamp≥0), raw_delta_usd e excess_cost_usd.
   B2. Para o "ANTES": NÃO re-executes o código bugado; CITA o valor que o caminho antigo produz
       (host-extra.js:1925-1929 sem clamp = o -$109.39 observado ao vivo) como referência documentada.
   B3. Tabela A/B: | métrica | ANTES (antigo) | DEPOIS (computeSavingsReceipt) | — provando que (a) o
       DEPOIS nunca é negativo em "poupado", (b) Cockpit e Control deixam de se contradizer (métricas
       diferentes, rotuladas). Número real, ou n/d honesto se faltar evento executed (não inventes;
       se n/d, usa 1 fixture rotulada NÃO-real só para ilustrar a forma).
   B4. Veredicto: o D1 está resolvido na fonte? SIM/NÃO com a evidência.
  **A (SECUNDÁRIO) · MERGE-SIM CONJUNTO — o único delta que o brain não fez:**
   A1. Numa worktree EFÉMERA dedicada, `git merge --no-commit --no-ff` das DUAS branches juntas
       sobre origin/main → há conflito? (o brain provou allowlists disjuntas por path; TU provas por
       merge real). `git merge --abort` no fim.
   A2. Se limpo: 1 corrida da suite integral pós-merge-sim → REDs novos? (delimita os conhecidos:
       gsd-statusline cold-spawn, tier-mix.js:35 typecheck — ambos pré-existentes, não-bloqueantes).
   A3. Ordem de merge recomendada + conflitos (se houver).
📍 WHERE  worktree EFÉMERA `../frugal-audit` criada SÓ para isto · fetch origin antes.
🛡 GUARD (endurecido)  **READ-ONLY de código.** O merge-sim é a ÚNICA operação git de escrita e SÓ na
  worktree efémera dedicada — NUNCA na árvore principal nem em branch de trabalho. Obrigatório no fim:
  `git merge --abort` + `git worktree remove` + provar zero-resíduo (`git worktree list` limpo,
  `git status` da principal intocado). classify FROZEN (só verificar). Única escrita permitida =
  `_handoff/VS_AUDIT_AB_REPORT_2026-07-19.md`. Sem push/merge real/commit em trabalho.
⚡ SE-ENTÃO  Se o merge-sim conflitar → achado nº1 (ficheiro exato + nova ordem de merge). Se RED novo
  pós-merge-sim → NO-SHIP com evidência. Se o ledger não tiver eventos executed → B = n/d honesto +
  fixture rotulada NÃO-real. Se a worktree efémera não puder ser removida → reporta como RED ALERT
  (resíduo), não deixes silencioso.
❌ DO-NOT  Alterar código de produção · re-verificar o que o brain já fez (sha/allowlist por path) ·
  re-executar o cálculo bugado antigo · commit/push/merge real · "consertar" achados (auditor reporta).
✅ GATE  tabela A/B com números reais (ou n/d rotulado) · veredicto D1 SIM/NÃO · merge-sim executado E
  abortado com prova de zero-resíduo · REDs delimitados · 🤝 SOCIO + council-mini.
📋 BACK  HANDOFF v1.1 ≤4k + `_handoff/VS_AUDIT_AB_REPORT_2026-07-19.md`: tabela A/B (a prova do D1),
  veredicto de merge (ordem + conflitos + zero-resíduo), REDs delimitados, PENDING honesta.
📮 DESTINO  Codex → BACK ao brain (moo-handoff-check) → a tabela A/B prova o D1 antes do CC ligar a UI;
  o merge-sim dá ao Paulo confiança de auditoria independente para mergear.
