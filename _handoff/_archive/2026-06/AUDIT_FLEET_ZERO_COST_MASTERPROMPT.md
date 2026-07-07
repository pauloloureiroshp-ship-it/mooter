# MASTERPROMPT — 🔍🐮 Auditoria $0 por Squad (a Fleet estreia read-only)

O trabalho de hoje aterrou em `main`: 7 verdes · Project Command **v1+v2** · Frente C (pm-adapters, por aterrar) ·
roadmap v3 · protocolo AGENTS.md · forecast engine + forecast.json. Antes de o declarar **impecável**, uma frota
de **moos locais ($0)** audita cada frente — **read-only**, checks mecânicos determinísticos + resumo do moo — e
**sinaliza** o que precisa do cérebro. É também o **arranque faseado seguro da Autopilot Fleet (W4)**: validar a
mão-de-obra numa missão SEM RISCO antes de a deixar tocar código.

## Invariantes (hard)
- **READ-ONLY.** A auditoria NÃO toca código, NÃO cria branches de feature, NÃO commita nada excepto o relatório.
- **$0.** Os *summaries* correm em **Ollama local** (qwen3:30b). Zero cloud. Os checks mecânicos são Node/git (grátis).
- **Divisão cérebro/mão-de-obra:** o CC (tu) **orquestra e constrói o harness**; os **moos** fazem os summaries;
  os **checks mecânicos** são a verdade determinística. O **veredicto final de impecabilidade é do Cowork/final-reviewer** — a frota **sinaliza, não decide.**
- `classify.js` **FROZEN** (prova a sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`).
- worktree própria · sem push sem OK.

## Setup
```
git worktree add ../frugal-audit -b chore/audit-fleet-zero-cost main
cd ../frugal-audit
```

## Âmbito — o trabalho de HOJE
`git log --oneline origin/main -20` (os merges de hoje) + as branches por aterrar (`feat/pm-adapters` etc.).

## As 8 squads e o que cada uma audita
| Squad | Alvo (o que mudou hoje na frente) |
|---|---|
| 🛩️ **Cockpit & UX** | Project Command v1+v2, F1 polish, doctor · testes 458, CSP-safe, honestidade (dormant/n/d) |
| ⚙️ **Platform & Data** | forecast engine, live-preview MP0, Ledger, o forecast.json gerado |
| 🔀 **Agent Comms** | protocolo AGENTS.md, comms P1+P2 |
| 🛡️ **Security & Privacy** | pack-audit + guard CORS não regrediram; nada de leaks novos |
| 📊 **Obs & Sustentação** | savings tracker, o roadmap v3 (coerência) |
| 📦 **Site & Distribution** | site-handoff-story (HandoffStory.tsx) |
| 🧭 **Routing & Inference** | classify.js sha intacta; engine não tocado |
| 🧠 **Auto-Evolution** | Frente C pm-adapters (por aterrar); gate honesto |

## Método (por squad — determinístico primeiro, moo depois)
1. **CHECKS MECÂNICOS (a verdade, $0):**
   - `classify.js` sha == invariante.
   - `node --test` do package da frente → nº pass/fail (se não corre, **"n/d"**, nunca inventes verde).
   - git: ficheiros da frente tocados hoje · em `main` vs por aterrar.
   - **honestidade-grep:** procura fabricação (números hardcoded em UI, `mock`/`fake` em runtime, número-nu sem fonte, `TODO`/`FIXME` críticos).
   - cobertura: ficheiros novos têm `.test`? invariantes: packages frozen não tocados; preview não commitado.
2. **MOO-SUMMARY ($0, qwen3:30b via Ollama):** o moo lê o diff da frente + os resultados dos checks e escreve
   3–5 linhas: o que está impecável · os nits · o suspeito. O moo **observa e sinaliza — não dá veredicto.**
3. **VEREDICTO PROVISÓRIO:** 🟢 (checks passam, moo sem flags) · 🟡 (nits) · 🔴 (check falha OU moo sinaliza suspeito → cérebro).

## Entregável
`_handoff/audit/AUDIT_REPORT_2026-07-03.md` — resumo no topo (contagem 🟢/🟡/🔴) + uma secção por squad
`[veredicto · checks reais · moo-summary · o que vai para o cérebro]`. Commita **só** este relatório.

## Gate
- **$0 provado** (Ollama local, zero cloud — o relatório declara o modelo e $0).
- `classify.js` sha intacta · **READ-ONLY provado** (`git status`: só o `AUDIT_REPORT.md`, nada mais).
- Checks **reais** (n/d onde não correu, nunca fabricado). Cola-me o relatório.

## NEXT — a Fleet contínua (W4)
Se este passe read-only correr limpo, é a **prova de conceito da Autopilot Fleet**. A W4 constrói o que falta:
`fleet-orchestrator.mjs` (SPOQ, caps GPU/cloud) + **Overclock Fase 2** (executor concorrente p/ saturar a GPU a
sério — hoje é série) + arranque faseado (1–2 pilares → validar → escalar). **Só depois de reduzir o WIP** (a cabine grita-o).
