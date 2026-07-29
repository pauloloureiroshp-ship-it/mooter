---
type: DECISION+TRACKING
id: bus-canonico-orchestration-20260720
from: cowork (brain)
severity: high
generated_at: 2026-07-20
socio_pack: v1@manual (tier L)
---
# 🚌 BUS CANÓNICO (decisão de arquitetura) + 📋 ORCHESTRATION LOG (tracking)

> Origem: E2E-INTEGRAÇÃO (Codex, NO-SHIP 07-20) provou que as peças foram construídas isoladas e NÃO se
> falam — buses incompatíveis, fleet sem id, cockpit fleet:null, métrica fabricada. Este doc DECIDE o
> contrato único de integração (parte A) e INICIA o tracking da comunicação do projeto (parte B). É a
> fonte única que a wave de reconciliação implementa. Nada de features novas — fazer as peças falarem.

---

## PARTE A — DECISÃO DO BUS CANÓNICO (a constituição de integração)

### A régua: 1 fila, 1 shape, 1 fonte de savings, atribuição por id causal

| # | Gap achado (E2E) | DECISÃO (o contrato único) | Dono da reconciliação |
|---|---|---|---|
| 1 | dispatch escreve `dispatch/dispatch.jsonl`; semáforo lê `agent-sync/dispatch-queue.json` (buses incompatíveis) | **BUS ÚNICO = `_handoff/agent-sync/dispatch-queue.json`** (schema VS-W0). O `dispatch.js` PARA de escrever o `.jsonl` próprio e passa a escrever no bus, com o shape completo `{id, lane, destino{agente,sessao_id}, severity, corpo, estado}`. Semáforo já lê daí ✅ | **CC** (dispatch.js + semáforo) |
| 2 | fleet metrics espera `wave_id`/`session_id` que o produtor (landing) não grava | **O produtor grava o id causal**: `local-pillar.mjs` carimba cada rollup com `source_event_id` (o mesmo id do bus). Sem id → `n/d`, nunca retroativo | **Codex** (producer + fleet-contrib) |
| 3 | cockpit `fleet:null` — nada liga fleet-contrib à strip | **O cockpit lê `fleet-contrib` por sessão** → o slot fleet da strip (já existe, @5599b55) recebe o dado real; ausente → `n/d` honesto | **CC** (strip ← fleet-contrib) |
| 4 | landing publica tokens locais como "cloud avoided" sem contrafactual | **Savings honesto único**: landing/cronista usam `computeSavingsReceipt` (clamp≥0, `estimated:true`); NUNCA "cloud avoided" sem contrafactual provado | **Codex** (savings) |
| 5 | 4 conflitos de merge (`package.json`, `fleet-orchestrator.mjs`, `extension.js`, `webview-syntax.test.js`) | Resolver na **branch de integração** `feat/e2e-reconcile` (não em 6 branches soltas), ordem receipts→landing→mesh→metrics→vs-w1→dispatch | **Codex** (tools/fleet) + **CC** (extension/test) |

### Princípio-mãe: contrato antes de código
O shape do bus (`dispatch-queue.schema.json`) e o shape do fleet (`fleet:{rollups,tokens,tok_per_s,cloud_avoided_usd,estimated:true}|null`) são a FONTE ÚNICA. Codex e CC implementam os dois lados CONTRA este doc, em paralelo (áreas disjuntas), e convergem no contrato — o brain (Cowork) costura. Assim não se repete o erro de construir no bus errado.

### O que NÃO muda
classify.js FROZEN · schema VS-W0 (já é o certo) · semáforo @5599b55 (já lê o bus certo) · a doutrina n/d.

---

## PARTE B — ORCHESTRATION LOG (o tracking da comunicação do projeto)

> Requisito do Paulo (07-20): rastrear como foi a comunicação entre o projeto todo — waves, momentos,
> horários, resultados — para saber se está tudo perfeito ou ir ajustando. Este log é VIVO: o Cowork
> acrescenta 1 linha por wave; cada agente carimba o `agent-sync/events.jsonl` (ts/from/to/wave/resultado)
> e reporta a linha no handoff. Timezone: BRT (America/Sao_Paulo).

### Timeline do projeto VS-Seam (populada com o que já aconteceu)

| # | Data | Wave | De → Para | Tipo | Resultado | Evidência |
|---|---|---|---|---|---|---|
| 1 | 07-19 | VSCODE_SYNERGY_MAP | Cowork → Paulo | pesquisa | ✅ entregue | 14 APIs mapeadas |
| 2 | 07-19 | VS-W0+W2 | Cowork → Codex | build | ✅ ACEITO (reproduzido) | @6271f85 |
| 3 | 07-19 | VS-W1 semáforo | Cowork → CC | build | ✅ ACEITO | @531a3b1 |
| 4 | 07-19 | Mesh A U2 | Cowork → Codex | audit | ✅ ACEITO (mesh já existia) | @7d408f5 |
| 5 | 07-19 | VS-VAL | Cowork → CC | demo | ✅ ACEITO (auto-auditou 6 overclaims) | @1603652 |
| 6 | 07-19 | G1+G2 | Cowork → CC | fix | ✅ ACEITO (object DB) | @782b8df |
| 7 | 07-19 | VS-RECEIPTS-BASE | Cowork → Codex | fix D1 | ✅ ACEITO | @9ff1735 |
| 8 | 07-19 | VS-AUDIT-AB | Cowork → Codex | audit | ✅ D1 provado + merge-sim limpo (2 branches) | report |
| 9 | 07-19/20 | Admissão | Cowork → Gemini | verify | ❌ DEVOLVIDO ×2 (painel/simulado) | — |
| 10 | 07-20 08:41 | VS-W1.5 | Cowork → CC | build | ✅ ACEITO (semáforo no cockpit) | @5599b55 |
| 11 | 07-20 08:46 | VS-FLEET-METRICS | Cowork → Codex | build | 🟡 BLOCKED (espera #257) | @5ddbb16 |
| 12 | 07-20 | E2E-DEMO | Cowork → CC | validate | ✅ ACEITO (composição headless) | @b01f73f |
| 13 | 07-20 12:37 | **E2E-INTEGRAÇÃO** | Cowork → Codex | audit | 🔴 **NO-SHIP — 4 gaps + 4 conflitos** (o achado) | report |
| 14 | 07-20 | E2E-COERÊNCIA | Cowork → Gemini | verify | ❌ DEVOLVIDO (mas honesto: n/d, não fabricou) | — |
| 15 | 07-20 | E2E-RECONCILE | Cowork → CC+Codex | reconcile | 🟡 G2/G3/G4/G5 fechados · **G1 ficou aberto** (dispatch.js só em moo-dispatch) | @eb29e33 |
| 16 | 07-20 14:01 | INTEGRAÇÃO+G1 | Cowork → CC | integration | 🔴→✅ **CC BLOQUEOU-REPORTOU: premissa da base falsa** (camada consumidora não estava na base + shape sem `created_at`). Brain confirmou no object DB. O confront-before-accept funcionou. | STOP0 |
| 16b | 07-20 | INTEGRAÇÃO+G1 v2 | Cowork → CC | integration | ✅ **FECHADO — bus único** (CC costurou vs-w1+vs-seam, portou dispatch.js, loop dispatch→beacon liga) | @a9edad2 |
| — | 07-20 | (nota) Codex STOP0 + Gemini n/d | Codex+Gemini → Cowork | verify | ✅ **triangulação automática**: ambos confirmaram a MESMA verdade que o CC (base sem consumidor) por métodos diferentes (ref-check · grep). Gemini: 1ª corrida honesta (greps reais, n/d, V4 fleet confirmado). | — |
| 17 | 07-20 | **ESTUDO POSICIONAMENTO** (paralelo, enquanto CC trabalha) | Cowork → Paulo | estratégia | ✅ entregue — tese wedge FinOps+confiança · teardown 8 concorrentes · convergência produto=Paulo (medir→testar→shippar) · masterprompts A/B/C prontos (segurados) | estudo+Notion |
| 18 | 07-20 17:17 | ledger-p1d (PRÓX-A) | Cowork → Codex | instrumentation | 🟡 instrumentado @5160393; KPIs ainda `n/d` (runtime não deu usage real) — HONESTO; Resume/statusline/queue-writer PENDING; sha intacto | @5160393 |
| 19 | 07-20 16:41 | transparencia-cc (PRÓX-B) | Cowork → CC | ux | ✅ 3 experiências (T1 custo real · T2 recibo · T3 decision-packet), 1502 pass/0 fail/+29; diff só vscode-extension; **pixel-shot PENDING** (Cowork computer-use); OBJ-2 (gate não-modal default) = decisão Paulo | @96c16c4 |
| 20 | 07-20 16:00 | verify-ledger (PRÓX-C) | Cowork → Gemini | verify | 🔎 W2/W3 CONFIRMO (UI honesta: `n/d` real, lê ledger) · W1/W4 `n/d` (ficheiros fora do working tree) · **0 fabricação**; Gemini honesto de novo | — |
| — | 07-20 | **HANDOFF CANÓNICO v2.0** (feedback Paulo: formatos divergem) | Cowork → protocolo | processo | ✅ esqueleto único de 9 secções + STATUS fechado + chrome proibido; embutido no `📋 BACK` de todo masterprompt | vault+Notion |
| — | 07-20 | DECISÃO commit gate (OBJ-2) | Paulo → CC | decisão | ✅ **híbrido por reversibilidade**: toast no reversível · modal forçado no ⛔ irreversível (force-push/deploy/merge) · unknown=fail-safe | contrato pronto |
| 21 | 07-20 | **SHIP-DAY** (esta) | Cowork → CC+Codex+Gemini | ship | 🔜 consolidar 3 branches em `feat/ship-day` (path-disjuntas, FF a main) → Codex audita SHIP → Gemini verifica → **gate Paulo: merge a main = o resultado do dia** | — |

### KPIs de orquestração (o que este tracking mede — todos com fonte ou n/d)
- **Taxa de aceite 1ª volta:** 9 ACEITO / 2 BLOCKED-ou-NO-SHIP / 3 DEVOLVIDO (Gemini) em 14 waves.
- **Erros apanhados ANTES do merge:** 4 (2 dispatches stale · 1 mount stale · **4 gaps de integração E2E**) — o valor do processo.
- **Fabricações apanhadas:** 2 (Gemini 07-17 ledger · 07-19 grep) + 1 evitada (métrica fabricada landing).
- **Tempo/tokens por wave:** `n/d — instrumentar` (é o que VS-FLEET-METRICS entrega quando destravar).
- **Agente × fit (observado):** CC=UI/plugin (9 waves, 0 rejeição) · Codex=determinístico/audit (6 waves, forense impecável) · Gemini=verify (0 aceites, mas honestidade a melhorar).

### Regra de tracking (todo masterprompt daqui pra frente)
Seção `📋 REGISTRO` obriga o agente a: (1) carimbar `agent-sync/events.jsonl` com `{ts, from, to, wave_id, type, result}`; (2) reportar no handoff a linha do log (nº, ts BRT, resultado). O Cowork consolida aqui a cada ciclo. Assim o Paulo vê a comunicação do projeto todo numa tabela — e sabe se está perfeito ou onde ajustar.

📮 Este doc é a fonte da wave E2E-RECONCILE (3 masterprompts) e o tracking vivo. Atualizar a cada handoff.
