📥 COLAR EM: Gemini · CLI `gemini` em ~/frugal · sessão FRESCA (NUNCA o painel Code Assist)
🔎🔗 E2E-COERÊNCIA · e2e-coerencia-gemini-20260720 · a cadeia de contratos liga ponta a ponta? (+ admissão)
---
type: MASTERPROMPT
id: e2e-coerencia-gemini-20260720
from: cowork (brain)
to: gemini (CLI, candidato EM PROVAÇÃO — esta corrida É a tua admissão instanciada como validação E2E)
severity: high
generated_at: 2026-07-20
role: verificador read-only. Zero escrita, em lado nenhum.
---
⇄ COWORK → GEMINI · MASTERPROMPT · E2E-COERÊNCIA — os contratos da experiência ligam-se?

⇄ ACK OBRIGATÓRIO (≤5 linhas, nas TUAS palavras). Contexto honesto: fabricaste prova em 07-17 e o
round-1 07-19 foi devolvido (painel + grep simulado). Esta corrida decide a tua readmissão E valida
a coerência E2E. O juiz é o Cowork; TODA alegação será reproduzida byte-a-byte.

🎯 GOAL — verificação READ-ONLY da CADEIA de contratos da experiência (cada elo → CONFIRMO/REFUTO/n/d
  + comando executado + output bruto):
  E1. **Contrato da fila** (VS-W0): `git show feat/ledger-receipts... ` não — a fila é
      `tools/agent-sync/dispatch-queue.schema.json` em `feat/vs-w1-semaforo @5599b55`. O validador
      `dispatch-queue-validate.js` existe e valida por item? (roda-o numa fixture).
  E2. **Semáforo lê a fila+registry** (VS-W1): `semaforo-decorations.js @5599b55` — `stateForWorktree`
      consome `pendingItems` (da fila) e `record.state` (registry)? A precedência é
      `blocker>paste>gate_pending>working>gate_unpushed>parked>closed` (grep no PRECEDENCE)?
  E3. **Semáforo no cockpit** (VS-W1.5): `semaforoForSession` existe e `row-renderer.js` pinta o chip
      com a MESMA fonte STATES (sem 2ª verdade)? O slot `fleet` está `n/d` (não zero)?
  E4. **Recibos** (VS-W2): `terminal-receipts.js` — `runWithReceipt` devolve exitCode real OU
      `n/d` no fallback (nunca 0 fabricado)?
  E5. **Savings** (receipts): `computeSavingsReceipt` em `feat/ledger-receipts @9ff1735` faz
      `max(0, raw_delta)` (nunca negativo) + `excess` separado?
  E6. **Fleet** (fleet-metrics): `fleet-contrib.js` em `feat/fleet-metrics @5ddbb16` — o contrato
      `fleet:{...}|null` bate com o slot que o CC lê no E3? Atribuição exige `source_event_id` (não
      timestamp)?
  E7. **VEREDICTO DE COERÊNCIA:** a cadeia liga fila→semáforo→cockpit→recibo→savings→fleet SEM
      contradição de contrato? Onde há elo frouxo (ex.: fleet n/d até merges), reporta como GAP honesto,
      não como falha.
🛡 GUARD  READ-ONLY ABSOLUTO (git show / grep / node numa fixture — zero escrita) · cada claim com
  comando ANTES do output · `git show <sha>:<path>` é a fonte (NÃO o mount, NÃO o doc de handoff) ·
  PT-BR · n/d honesto.
⚡ SE-ENTÃO  Se um contrato NÃO ligar (ex.: o slot fleet do CC tem shape diferente do que o Codex emite)
  → é o teu achado nº1, detalha com os 2 shapes lado a lado. Se não conseguires aceder a uma branch →
  n/d + o que tentaste. Refutar um elo VALE MAIS que confirmar (sycophancy = reprovação).
❌ DO-NOT  Escrever/editar QUALQUER ficheiro · inventar output (ids hex, grep "de memória", teste verde
  não-executado = os red-flags que o juiz caça) · usar o painel Code Assist · parafrasear handoffs
  como se fosse verificação.
✅ GATE (o juiz)  moo-handoff-check reproduz CADA `git show`/grep/node byte-a-byte · rubrica 10 pontos ·
  ACEITO = readmissão + coerência E2E validada; DEVOLVIDO = provação continua.
📋 BACK  HANDOFF v1.1 INLINE (≤4k): tabela E1-E7 (elo · CONFIRMO/REFUTO/n/d · comando · output bruto),
  veredicto de coerência da cadeia, gaps honestos, TL;DR 5 linhas.
📮 DESTINO  Gemini CLI ~/frugal (leitura) → BACK ao brain (juiz) → coerência E2E + readmissão.
