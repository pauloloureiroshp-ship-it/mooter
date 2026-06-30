# MASTERPROMPT — Ledger Spine (L0+L1) · a FUNDAÇÃO de memória + auditoria

És uma sessão CC a construir a espinha dorsal do Mooter: o **ledger de eventos** que torna o
trabalho dos moos locais **auditável, concorrência-seguro e replayável**. Lê primeiro
`docs/strategy/MOO_LEDGER_AND_ORCHESTRATION.md` (design + fontes SOTA) e
`_handoff/guardian/_ORCHESTRATION.md` (regras paralelas).

**Ordem:** esta fundação (L0+L1) **vem antes** do Guardian F2/F3 — eles passam a *emitir eventos*
neste ledger em vez de escreverem MD directamente. Constrói isto primeiro.

## Setup
```
git worktree add ../frugal-ledger -b feat/moo-ledger-spine main
cd ../frugal-ledger
cd packages/cli && npm install && cd ../router && npm install && cd ../..
```
Trabalha SÓ neste worktree.

## Princípio inquebrável (do SOTA 2026 — não negociar)
**O journal é a verdade; MD/SQLite/Notion são projecções dele.** Os moos **emitem eventos**;
um **único reducer** materializa as projecções. **Nenhum** moo edita um MD partilhado no sítio.
Proveniência é **mecânica** — o runner carimba; o LLM nunca escreve a sua própria proveniência.

## Estuda antes de codar (não reinventes)
- `tools/router/handoff-journal.js` — JÁ é um JSONL append-only por sessão, bounded ~50, roll
  atómico, **never-throws**. É a base do ledger. O formato é lido **byte-a-byte** por
  `host-extra.js` (o reader do cockpit) → **só podes ADICIONAR campos** (readers antigos ignoram
  campos desconhecidos). **Nunca** mudes/remuves campos existentes nem partas o never-throws.
- `handoff-rollup.js` (projecção qwen), `decisions_v2.js/.jsonl`, `handoff-bus.js` — vizinhos.

## L0 — Proveniência no ledger (additivo, back-compat)
1. Estende a entrada do journal com campos **opcionais additivos** de proveniência:
   `{ agent, model, tier, kind, cost_usd, input_hash, output_hash, idem_key, gate }`.
   - `agent` = id do moo (ou "cc" para o arquitecto).
     `kind` ∈ `intent | turn | decision | outcome | handoff | compact | summary | extract`.
   - **Ciclo de vida do masterprompt (primeira-classe):** `intent` (masterprompt colado, ao arrancar) →
     `turn` (trabalho) → `decision` (pergunta do CC + opções + resposta escolhida + quem respondeu) →
     `outcome` (resultado + handoff-summary). Ver `docs/strategy/MOO_LEDGER_AND_ORCHESTRATION.md`.
   - **Captura de decisão MECÂNICA:** o turn-end hook (`gsd-turn-end.js`) deve detectar um
     AskUserQuestion no transcript + a resposta seguinte e emitir `kind:decision` com
     `{ question, options, chosen, answered_by }` — **derivado do transcript, nunca inventado**. Um moo
     acrescenta `rationale` (1 linha) e passa pelo gate. Liga também ao `decisions_v2.jsonl` existente.
   - **Helpers novos, puros:** `canonicalize(obj)` (JSON estável, chaves ordenadas) +
     `provHash(io)` (SHA-256 hex sobre o canonicalizado). Em `tools/router/` (novo ficheiro
     `ledger-prov.js` + teste), **não** dentro do classify.js.
   - `appendTurn` continua a funcionar idêntico para entradas sem proveniência (back-compat total).
   - Novo `appendEvent({sid, agent, model, tier, kind, input, output, idem_key})` que carimba
     ts + hashes mecanicamente e faz dedupe por `idem_key` (mesmo idem_key → não duplica).
2. Doutrina preservada: **best-effort, never-throws**; o hook de turn-end nunca pode partir um turn.

## L1 — Reducer + projecção (mata escritas directas a MD)
1. `tools/router/ledger-reduce.js` (puro, testável): lê o JSONL e projecta **o último evento
   `kind:handoff` por sid** → escreve `_handoff/guardian/<sid>.md` **atomicamente** (tmp+rename).
   Determinístico: a mesma sequência de eventos → o mesmo MD (replay).
2. (Opcional, se sobrar tempo) um índice SQLite/JSON simples sobre os eventos para o cockpit
   consultar rápido — projecção descartável/reconstruível, nunca fonte de verdade.

## Invariantes (CI)
- `tools/router/classify.js` **FROZEN** — nunca tocar (sha enforced).
- Journal: **só additivo**; nunca partir o reader `host-extra.js` nem o never-throws.
- Se tocares `extension.js`: **`node --check`** obrigatório antes de empacotar/commitar.
- `git add` selectivo; sem `.md` novos na raiz; PT-PT conversa / inglês código.

## Gate (pára e reporta — bulletproof)
- **Back-compat:** entradas antigas do journal continuam a ser lidas; `appendTurn` byte-idêntico.
- **Proveniência estável:** `provHash` do mesmo I/O canonicalizado dá sempre o mesmo hash; teste.
- **Idempotência:** dois `appendEvent` com o mesmo `idem_key` → uma só entrada efectiva; teste.
- **Replay determinístico:** `ledger-reduce` sobre a mesma sequência → o mesmo `<sid>.md`; teste.
- **Decisão capturada (mecânica):** com uma fixture de transcript que tem um AskUserQuestion + a
  resposta seguinte, o hook emite `kind:decision` com `question/options/chosen/answered_by`
  **derivados do transcript** (não inventados); teste com fixture. Sem AskUserQuestion → zero eventos.
- **Never-throws:** injecta um erro de fs → não lança, degrada; teste.
- `node --test` de `tools/router/*ledger*.test.js` + `handoff-journal.test.js` verdes; classify.js sha intacta.
- Commit selectivo. **NÃO** mergeies. Mostra o diff + o resultado dos 5 testes do gate.

## Porque isto impressiona (e é à prova de bala)
Dá ao Mooter as 3 propriedades que summarization-memory não dá (ActiveGraph): **replay
determinístico**, **fork barato**, **lineage total** — com proveniência mecânica, idempotência e
concorrência-segura por construção, a **custo $0** porque o git já é o store imutável/atribuído/replayável.
