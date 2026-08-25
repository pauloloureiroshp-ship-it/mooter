# 🪞✨ The Perfect Handoff — Spec (o que o Cowork quer receber, sem prints)

> **Objectivo:** depois de uma sessão CC, os moos produzem um handoff **tão completo e exacto** que o
> Cowork (Claude) age sobre ele **sem nunca pedir um screenshot**. Determinístico no detalhe, qwen só
> de guarnição. É o trunfo do Mooter: *perfect handoff + learns forever.*

> **STATUS (auditoria multiagente 2026-07-10): PARCIAL.** A projeção por sessão é
> forte, mas o Ledger ainda não é durável/concorrente e a fila documental voltou a
> divergir. “Perfect” só volta a ser verdadeiro quando os gates P1 abaixo fecharem.

## Modelo de autoridade (alvo)

1. **Verdade:** event log durável, ordenado e transacional (`sid + seq + event_id + schema_version`).
2. **Projeções:** handoff por sessão, board do projeto e `SYNC.md`; nenhum deles recebe escrita concorrente direta.
3. **Work order:** um packet ativo tipado em `_handoff/`, com dono, estado, worktree, guardas, gate e próximo passo.
4. **Memória:** `LOOP.md`/`MEMORY.md`; Notion e vault são espelhos, nunca pré-requisitos invisíveis.
5. **Humano:** Paulo autoriza merge, push, deploy, delete e overrides de invariantes.

Fluxo de ciclo de vida: `draft → ready → claimed → blocked|verified → shipped → archived`.
Um packet sem estado explícito não está pronto para execução; um packet shipped que
permanece no topo é drift detectável, não “memória útil”.

## Gate de perfeição aberto (2026-07-10)

| Prioridade | Falha observada | Gate para fechar |
|---|---|---|
| P1 | turn snippets e eventos dividem o mesmo buffer móvel de 50 linhas | separar context buffer do ledger append-only; rollover 50+ preserva intent/decision/outcome |
| P1 | append/dedupe/rewrite e upsert de `SYNC.md` não têm single-writer/lock transacional | stress multiprocess sem perda/duplicação; temp único + fsync ou SQLite WAL |
| P1 | writers diretos contornam `ledger-reduce` | toda projeção de produção nasce do reducer; replay gera resultado byte-idêntico |
| P1 | `wave ship --force` pode contornar SHA e ship não exige fases/gates completos | SHA nunca é overrideable; ship exige fases, evidência e merge verificados |
| P1 | auto-lock do conductor avisa, mas deixa o git concorrente continuar | conflito de lock bloqueia mutação ou enfileira intent; teste E2E prova o comportamento |
| P2 | payloads do ledger são crus, ilimitados e sem schema/redaction | schema versionado, limites, redaction e proveniência recalculada internamente |
| P2 | fila ativa/documentos canônicos voltam a acumular | `node tools/docs-hygiene.js` verde em modo warn; depois baseline limpo e `--strict` no CI |

Correções implementadas nesta auditoria (execução do gate Node pendente neste shell):
erros de `AskUserQuestion` deixam de virar “decisões humanas”; `composeHandoff`
preserva `perfect`, Ledger e proveniência durante o enriquecimento local; os testes
de Ledger entram no gate principal do router.

## Auditoria da mecânica actual (2026-06-30)
| Peça | Faz | Veredicto |
|---|---|---|
| `gsd-turn-end.js` (Stop hook) | grava journal por turno + dispara rollup | ✅ base sólida |
| `handoff-journal.js` (Live Context Accumulator) | JSONL append-only por sessão (snippet + tool calls + git) | ✅ é o ledger embrionário |
| `handoff-rollup.js` (qwen local) | narrativa 1-3 linhas, throttled, never-fabricate | ⚠️ **fraca** (qwen3b → "Repeat the topic", lista tool calls) |
| `generateHandoff` (host-extra.js) | monta ASK/HEAD/GATE/**PENDING**/DOING/NEXT/RECAP | PENDING **verbatim** ✅ mas **truncado ≤300c** ⚠️ |
| atribuição git por-sessão | journal-git OU árvore partilhada | ❌ **mente** (Handoff Truth corrige) |
| `projHandoff` (extension.js:601) | BOARD do projecto | ❌ cego aos worktrees, "0 UNPUSHED" falso |

## Os 6 buracos para "Cowork-perfect"
1. **Git impreciso** (worktree/push) → *Handoff Truth* (masterprompt já feito).
2. **PENDING truncado** — quando uma sessão espera por ti, preciso da **pergunta COMPLETA + TODAS as opções**, não 300c.
3. **DOING/RECAP fracos** — narrativa qwen3b a ecoar. O "o que a sessão fez" tem de ser **factos mecânicos**.
4. **GATE sem detalhe** — preciso de `node --test 389/389 ✓ · sha ✓ · node --check ✓ · vsix byte-idêntico`.
5. **Sem histórico de decisões** — as perguntas que o CC fez + a tua resposta escolhida (decision capture).
6. **Project handoff incompleto** — estado por-sessão (landed/parked/awaiting) + perguntas abertas completas.

## A filosofia (o insight que torna tudo mágico)
**O handoff perfeito é DETERMINÍSTICO. O qwen é guarnição, nunca substância.** Os campos de valor
capturam-se **mecanicamente** (ground-truth, como o PENDING já é) — e isso é literalmente o **Ledger**:
o handoff perfeito é uma **PROJECÇÃO do Ledger** (eventos `intent/turn/decision/outcome` com proveniência).
Tudo o que construímos (Guardian, Ledger, Truth) **converge aqui**.

## O formato Cowork-perfect — POR-SESSÃO (eu, o consumidor, especifico)
```
⇄ MOO HANDOFF · <título> · <sid> · <ts>
STATE:    parked | awaiting-you | landed | in-progress      ← o campo mais importante, explícito
WORKTREE: ../frugal-X · feat/Y @<sha7> · N ahead of main · UNPUSHED ⚠ | pushed ✓   ← worktree-true
GATE:     node --check ✓ · tests 389/389 ✓ · classify.js sha ✓ · vsix byte-idêntico ✓   ← MECÂNICO
WORK:     <git diff --stat: +X/-Y, N fich.> · commits: <sha7 msg>                       ← MECÂNICO
DECISIONS:                                                                               ← do ledger
  Q:"<pergunta>" → escolheu:"<opção>" (Paulo via Cowork) · porquê:<racional 1 linha>
PENDING (só se awaiting-you):                                                            ← COMPLETO, verbatim
  Q:"<pergunta INTEIRA>"
  opções: 1)<inteira> 2)<inteira> 3)<inteira>
NEXT:     <o próximo passo>
~narrativa (qwen, best-effort): <DOING/RECAP — claramente opcional, nunca load-bearing>
⇄ END
```

## O formato Cowork-perfect — PROJECTO
```
⇄ MOO PROJECT HANDOFF · <projecto> · <N sessões> · <ts>
ATENÇÃO (o que precisa de TI, primeiro):
  🔵 awaiting-you: <sessão> — Q completa + opções
  🟡 parked (precisa push): <sessão> — feat/Y @sha7, testes 389/389 ✓
RISK:   <só divergência REAL, não artefacto de tree partilhado>
BOARD:  <por sessão: STATE · worktree-true branch · gate resumido>
UNPUSHED: <por branch, exacto — soma de todos os worktrees>
NEXT FOR COWORK: <só se genuinamente limpo>
⇄ END
```

## Regra de ouro (a blindagem)
**Nunca dizer "limpo/0 unpushed/✅" sem ser verdade.** Quando incerto → "n/d", nunca palpite. Testes-
regressão garantem que o handoff falha o build se voltar a mentir. O Cowork tem de poder **agir só com o
texto** — se um campo me obrigaria a pedir um print, ele falta no handoff.

## Double-check do double-check: os campos que matam o overwhelm (o verdadeiro porquê)
O Mooter não vende tokens/seg nem só "local na performance do Opus". Vende **tempo** e **não desistir**:
acordar e saber EXACTAMENTE onde estavas, não te afogares com 8 terminais, não gastares a tua hora
escassa a re-ambientar. O handoff **É** esse valor. Por isso, além dos campos acima:

**POR-SESSÃO (+):**
- **TL;DR** (1 linha no topo): `parked · push 1 branch · 0 decisões` — valor de relance.
- **INTENT**: o objectivo original do masterprompt — âncora o "porquê" (que esqueces no dia seguinte).
- **RESUME**: a **próxima acção EXACTA, copy-paste** — re-entras no flow em segundos, sem te perderes.
- **TIME**: `última actividade há Xh · à tua espera há Yh` — respeita o teu tempo, mostra onde és o gargalo.
- **DELTA desde que olhaste**: só o que mudou — não re-lês tudo.
- **conf:** marcadores por-campo (`git ✓ · gate ✓ · narrativa ~`) — o que confiar; incerto = `n/d`, nunca palpite.
- **PENDING act-ready**: a pergunta aberta vem com o **contexto mínimo para o Cowork recomendar** — não só a Q.

**PROJECTO (+) — a triagem anti-overwhelm:**
- **🎯 A ÚNICA COISA**: a acção de maior alavanca agora — corta o overwhelm de 8 sessões numa linha.
- **TRIAGE com custo de tempo**: `⏱2min responder X · ⏱5min push A,B · ⏳ a aguardar dep · 💤 idle N` —
  onde gastar os minutos escassos.
- **GOAL**: o objectivo macro que liga as sessões — o fio condutor que não se perde.

> A régua final: **depois de uma noite de sono e com 8 terminais abertos, o handoff sozinho devolve-te
> ao controlo em 30 segundos.** Se não devolve, falta-lhe um campo.

## Sequência de construção
`Ledger Spine` (captura mecânica) → `Handoff Truth` (git exacto) → `Perfect Handoff Render`
(projecta o ledger no formato acima: STATE + GATE-detail + WORK + DECISIONS + PENDING-completo;
qwen demovido a guarnição). Ver `_handoff/_archive/2026-06/PERFECT_HANDOFF_MASTERPROMPT.md`.

## Convenção do Ledger (FASE 4 — fecha o ciclo · IMPLEMENTADO em Perfect Handoff v2)
O handoff perfeito é uma **projecção do Ledger**: `generateHandoff` lê os eventos da sessão
(`sessionLedgerEvents(sid)` → entradas com `kind`) e projecta-os em vez de recomputar. Para o GATE
ser sempre mecânico e completo, **o passo de gate de QUALQUER masterprompt emite um evento**:

```js
// no fim do gate (tools/router/handoff-journal.js):
appendEvent({ sid, kind: 'outcome', output: {
  nodeCheck: true,        // node --check passou  (bool)
  tests: '417/417',       // "pass/total"          (string) ou { pass, total }
  sha: true,              // classify.js sha frozen intacta (bool) ou a própria sha (string)
  vsix: true,             // .vsix byte-idêntico ao source (bool; omite se não empacotou)
} });
```

O render projecta assim (fonte única, nunca fabricado):
- `kind:intent`  → **INTENT** (`output.goal|intent|text|summary`).
- `kind:decision`→ **DECISIONS** (`output.{question, chosen, why}`; tolera `q/choice/answer/rationale`).
- `kind:outcome` → **GATE✓** mecânico (`_ledgerGateLine`). Sem outcome → o GATE fica só com os factos
  git; **nunca inventa** um "verde" que o gate não emitiu.

Régua: se um campo não tem evento, o handoff diz `n/d` — jamais um palpite.
