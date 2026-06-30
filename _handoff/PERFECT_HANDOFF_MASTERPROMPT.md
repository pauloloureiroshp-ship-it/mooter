# MASTERPROMPT — 🪞✨ Perfect Handoff Render (o handoff que o Cowork age sem print)

Lê `docs/strategy/PERFECT_HANDOFF_SPEC.md` (a auditoria + o formato exacto que o Cowork quer) +
`_handoff/HANDOFF_TRUTH_MASTERPROMPT.md`. **PRÉ-REQUISITO:** Ledger Spine + Handoff Truth em `main`
(o handoff perfeito é uma **projecção do Ledger**). Se faltarem, **pára e avisa**.

## Setup
```
git worktree add ../frugal-perfect-handoff -b feat/perfect-handoff main
cd ../frugal-perfect-handoff
cd packages/cli && npm install && cd ../router && npm install && cd ../..
```

## Onde está (ancorado em MAIN — estuda primeiro)
- `generateHandoff` em `host-extra.js` (~L1245-1371): monta ASK/HEAD/GATE/**PENDING**/DOING/NEXT/RECAP.
  PENDING já é **verbatim ground-truth** (~L1320, ≤300c) — o LLM nunca lhe toca. **Bom padrão a estender.**
- `projHandoff` em `extension.js:601` · `handoff-journal.js` · `handoff-rollup.js` (qwen — guarnição).

## Objectivo
Tornar o handoff **determinístico no detalhe**, projectando os eventos do Ledger. Os campos de valor
deixam de depender do qwen. O Cowork tem de poder agir **só com o texto**.

## Correcções (por-sessão, em `generateHandoff`)
1. **STATE** (campo novo, o mais importante): deriva `parked | awaiting-you | landed | in-progress`:
   - awaiting-you = último turn do transcript é um **AskUserQuestion aberto**;
   - parked = branch tem commits unpushed + último `kind:outcome` do ledger diz testes verdes;
   - landed = branch já em `main`; senão in-progress.
2. **GATE detalhado** (mecânico): lê o último `kind:outcome` do ledger da sessão →
   `node --check ✓ · tests <N/N> · classify.js sha ✓ · vsix byte-idêntico`. Sem outcome → `n/d (sem outcome)`.
3. **WORK** (mecânico): `git diff --stat main..<branch>` (+X/-Y, N fich.) + lista de commits (`sha7 msg`).
4. **DECISIONS** (do ledger `kind:decision`): `Q:"…" → escolheu:"…" (Paulo via Cowork) · porquê:…`.
5. **PENDING COMPLETO**: quando awaiting-you, captura a **pergunta INTEIRA + TODAS as opções verbatim**
   (estende o verbatim de ≤300c para o bloco completo do AskUserQuestion). NUNCA truncar a pergunta aberta.
6. **qwen demovido**: DOING/RECAP passam a `~narrativa (qwen, best-effort)`, claramente opcional.
7. **Anti-overwhelm (o verdadeiro porquê — ver spec §double-check):**
   - **TL;DR** (1 linha no topo) · **INTENT** (goal do masterprompt, do `kind:intent`) ·
     **RESUME** (próxima acção copy-paste, derivada de NEXT+PENDING) ·
     **TIME** (`última act há Xh · à tua espera há Yh`, dos timestamps do journal) ·
     **DELTA desde que olhaste** (eventos do ledger desde o último handoff lido) ·
     **conf:** marcadores por-campo · **PENDING act-ready** (Q + opções + contexto mínimo para recomendar).

## Correcção (project handoff, `extension.js:601`) — a triagem anti-overwhelm
1. **🎯 A ÚNICA COISA** (1 linha no topo): a acção de maior alavanca agora.
2. **TRIAGE com custo de tempo:** `⏱2min responder X · ⏱5min push A,B · ⏳ a aguardar dep · 💤 idle N` —
   onde o Paulo gasta os minutos escassos. 🔵 awaiting-you trazem a Q+opções completas; 🟡 parked o branch@sha+gate.
3. **GOAL**: o objectivo macro que liga as sessões.
4. Depois BOARD (STATE + branch worktree-true + gate) e UNPUSHED exacto. RISK só por divergência real.

## Convenção (fecha o ciclo — adiciona aos gates dos masterprompts)
O passo de gate de QUALQUER masterprompt passa a **emitir `appendEvent kind:outcome`** com o resumo do
gate (testes, sha, node --check). Assim o GATE do handoff é sempre mecânico e completo. Documenta isto.

## Gate (pára e reporta — blindagem)
- **Teste:** fixture de ledger (intent+turn+decision+outcome) → o render produz o handoff no formato da
  spec, com STATE/GATE/WORK/DECISIONS correctos. Falha se faltar algum campo mecânico.
- **Teste:** sessão awaiting-you → PENDING tem a pergunta **inteira + todas as opções** (não truncada).
- **Teste anti-print:** o handoff de uma sessão parked contém tudo o que o Cowork precisa (branch, sha,
  unpushed, gate, work) — sem campo "n/d" onde havia dado. (Se obrigaria a pedir print → falha.)
- **Teste anti-overwhelm:** project handoff tem `🎯 A ÚNICA COISA` + TRIAGE com custos de tempo;
  por-sessão tem `TL;DR` + `RESUME` (copy-paste) + `INTENT`. Régua: devolve o controlo em ~30s.
- `node --check` + `node --test` COMPLETO verde · `classify.js` sha intacta · `git add` selectivo · não mergeia · diff.
```
