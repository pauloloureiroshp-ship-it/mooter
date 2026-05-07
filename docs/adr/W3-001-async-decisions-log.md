# ADR W3-001 — Async appendDecisionsLog (Wave-3 T-1)

**Date**: 2026-05-08 (planeado · placeholder)
**Status**: 🟡 Proposed (await Wave-3 kick-off)
**Owner**: Paulo Loureiro
**Wave**: 3
**Reviewer**: final-reviewer (Opus + cache)
**Related**: SYNC.md Sessão #40 final-reviewer notes; Wave-2 T-09

> **Nota**: este é um template ADR para Wave-3 T-1 — o user deve preenchê-lo com decisões empíricas após implementar. Mantém como skeleton.

---

## Contexto

Wave-2 final-reviewer (Opus subagent) sinalizou em 2026-05-07 (não-blocante):

> "`appendDecisionsLog` usa `fs.appendFileSync` no hot path. Single-process hoje (CLI sequencial) → OK. Wave-3 (parallel callers) → trocar por async + queue."

Com Wave-3 a abrir caminho para parallel callers (router-execute em pipelines não-CLI, e potencialmente vários workers a despachar em concorrência), o uso de `appendFileSync` no hot path torna-se um gargalo:

- Bloqueia event loop por ~1-3ms em cada chamada
- Em worktrees paralelos (Ralph Loop), fs lock contention possível
- Inconsistência potencial em writes concorrentes (não atomicity garantida em Node fs)

## Decisão

Substituir `appendDecisionsLog` por:

1. **In-memory queue** (`Array<DecisionEntry>`) com flush periódico
2. **Async file write** via `fs.promises.appendFile` ou `WriteStream`
3. **Flush triggers**: (a) cada N=10 entries OR (b) cada T=500ms OR (c) `process.exit` handler
4. **Atomic write strategy**: write to `decisions.log.tmp`, rename atomic on flush

## Alternativas consideradas

| Alternativa | Pros | Cons | Decisão |
|---|---|---|---|
| Manter `appendFileSync` | Simples, atomic per-write | Bloqueia event loop, lock contention parallel | ❌ Wave-2 reviewer flagged |
| `fs.promises.appendFile` simples | Async, compat com promises | Ainda 1 syscall/decisão; sem batching | ⚠️ Não resolve scale |
| Queue + flush periódico | Batching reduz syscalls; controla burst | Risk: perda de últimas entries em crash | ✅ Escolhida (com signal handlers) |
| External queue (Redis/SQLite) | Production-grade | Overkill MVP; +deps; +latência | ❌ Wave-4+ |
| Replace por OTel exporter directo | Standards-aligned | Wave-4 scope (telemetry overhaul) | ⏸ Wave-4 |

## Implementação proposta

```js
// tools/router/decisions-log.js (novo módulo)

const QUEUE = [];
let flushTimer = null;
const FLUSH_INTERVAL_MS = 500;
const FLUSH_BATCH_SIZE = 10;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flushQueue, FLUSH_INTERVAL_MS);
}

async function flushQueue() {
  if (QUEUE.length === 0) {
    flushTimer = null;
    return;
  }
  const entries = QUEUE.splice(0, QUEUE.length);
  flushTimer = null;
  const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  await fs.promises.appendFile(DECISIONS_LOG_PATH, lines, 'utf8');
}

function appendDecisionsLog(entry) {
  QUEUE.push(entry);
  if (QUEUE.length >= FLUSH_BATCH_SIZE) {
    flushQueue().catch(console.error);
  } else {
    scheduleFlush();
  }
}

// Drain on exit
process.on('beforeExit', flushQueue);
process.on('SIGTERM', flushQueue);
process.on('SIGINT', flushQueue);
```

## Consequências

### Positivas

- ★ Hot path: `appendDecisionsLog` retorna em ~50µs (push to array)
- ★ Throughput escala — N concurrent callers não competem por fs lock
- ★ Atomic ordering preserved within a flush batch
- ★ I/O reduzido: 1 syscall por 10 entries (vs 1 por entry)

### Negativas / Riscos

- ⚠ Risco de perda das últimas N entries em crash não-graceful (SIGKILL, OOM)
  - Mitigação: signal handlers cobrem 80% dos casos; `process.on('uncaughtException')` flush antes de exit
- ⚠ Ordem global pode divergir entre processos paralelos
  - Mitigação: cada entry tem `ts` e `request_id` — re-ordering trivial em análise
- ⚠ Flush periódico significa que `tail -f decisions.log` tem lag de até 500ms
  - Mitigação: aceitável para debug; live mode dev tem flag `--sync-log`

## Definition of Done

- [ ] `tools/router/decisions-log.js` criado com queue + flush periódico
- [ ] `tools/router/router-execute.js` migrado para usar novo módulo
- [ ] `tools/router/savings-tracker.js` migrado
- [ ] Tests: 8 cenários cobrindo
  - [ ] flush on size threshold (FLUSH_BATCH_SIZE entries)
  - [ ] flush on timer (FLUSH_INTERVAL_MS)
  - [ ] flush on beforeExit
  - [ ] flush on SIGTERM
  - [ ] flush on SIGINT
  - [ ] concurrent appends preserve all entries
  - [ ] re-ordering by ts + request_id valid
  - [ ] no entries lost on graceful exit
- [ ] Stress test: 10k entries em 100 chamadores paralelos — todos persistidos
- [ ] Suite passa: 295/296 + novos testes
- [ ] `git diff` aa25a2b -- `tools/router/classify.js` = vazio (I11 mantido)
- [ ] final-reviewer (Opus + cache) APPROVED

## Métricas de validação

| Métrica | Target | Como medir |
|---|---|---|
| Hot path latency | <100µs p99 | Microbenchmark: 1M iter, time per call |
| Throughput | 10k entries/s sustained | Stress test, 100 callers paralelos |
| Data loss em SIGTERM | 0 entries | Send SIGTERM mid-flush; count entries persisted |
| Data loss em SIGKILL | <FLUSH_BATCH_SIZE entries | Send SIGKILL; count loss vs FLUSH_BATCH_SIZE |
| Memory footprint | <1MB para 1k entries | Heap snapshot |

## Notas para futuro (Wave-4+)

- Considerar OTel exporter directo (substitui módulo custom)
- Ring buffer com size cap se memory issues em workloads extremos
- Per-process log files com pid suffix para evitar contention completa

## Sources

- [Node.js fs.promises docs](https://nodejs.org/api/fs.html#promises-api)
- [Node.js process events](https://nodejs.org/api/process.html#process-events)
- Wave-2 final-reviewer note (SYNC.md Sessão #40)
- ADR-format inspirado em [github.com/joelparkerhenderson/architecture-decision-record](https://github.com/joelparkerhenderson/architecture-decision-record)

---

**Approval signatures**

- [ ] Paulo Loureiro (owner)
- [ ] final-reviewer (Opus + cache) APPROVED
- [ ] Date: ____
- [ ] Commit hash: ____
