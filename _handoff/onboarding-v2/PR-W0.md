## O que estava errado

O `/dashboard` publicava poupança em **seis** superfícies. Não era uma com um bug — eram seis,
e as seis derivavam da mesma aritmética modelada (`decisões × $0,015`, ou `× $0,045`), preços de
tabela que ninguém pagou, com **zero tokens contados dos dois lados**:

1. `SavingsCalculatorCard` — 50 prompts/dia × 2000 tokens × uma taxa fixa de 0,7, com dois sliders.
2. Herói — `$saved` e a percentagem contra all-Opus.
3. Cartão de profundidade — quatro cifras, as quatro do mesmo cálculo.
4. Uma cifra por device na lista de devices.
5. Uma cifra por dia no histórico.
6. Uma coluna «Savings» na tabela de modos: `None` / `High` / `Maximum` — uma alegação de
   poupança vestida de adjectivo.

A calculadora era a pior, e não pela aritmética: o **slider** é o que faz uma invenção parecer
uma medição pessoal.

## O que entra

**Quatro KPIs**, em `landing/app/(app)/dashboard/_kpis.ts` — puro, sem React, sem I/O, testado
à unidade:

| KPI | Fonte | Estado |
|---|---|---|
| Tarefas roteadas | contagem sincronizada do próprio router | medido |
| Cobertura local | fracção T0 da `tier_distribution` do próprio utilizador | medido quando há sync |
| Janela preservada | tarefas nunca despachadas para uma janela paga | **estimado** (rótulo no próprio label) |
| ESR | `(custo-equivalente cloud − custo pago) ÷ custo-equivalente cloud` | **`n/d`, com a razão à vista** |

O ESR é o KPI que importa e é o único sem número, de propósito: exige tokens medidos dos **dois**
lados. Medido pelo adversário a 2026-09-10: **0 de 156** eventos do ledger têm campos de tokens
estruturados — a única «linha com tokens» era texto livre dentro do `summary`. W4 fecha isso.
Até lá o ecrã diz `n/d` e diz porquê.

## Três testes exigiam o número de volta — foram invertidos, não apagados

`parity.test.ts` (Wave 9) obrigava a string `% saved vs all-Opus` a **existir** no ficheiro.
`wave12-dashboard.test.ts` (D7, dois testes) obrigava o cartão de profundidade e as duas cifras
marcadas `modelado: true`.

Eram guardas honestas para o mundo em que o número existia. No dia em que a decisão do dono
remove o número, um teste que continua a pedir a coisa removida deixa de ser guarda e passa a
**roquete no sentido errado**. Passam a guardar a ausência, e cada um leva escrito porque mudou
e para onde aponta o sucessor (`kpis.test.ts`).

## ADR

`docs/adr/ADR-onboarding-v2.md` grava as decisões **D1–D6** aprovadas pelo dono (ata em
`_handoff/onboarding-v2/ATA-D1-D6-2026-09-10.md`), com a refutação do codex
(`job-mtvmlw3l-f78e`) anexada **na íntegra** — incluindo os dois veredictos que derrubaram
hipóteses do próprio dono: o `.mcpb` com token embutido (**refutada**: bundle copiável =
credencial copiável) e o Moo Token como odómetro principal (**refutada**: 4 chars não conservam
latência, energia, quota nem custo). A secção 5 declara **sete `n/d`** em vez de os estimar.

## Portões

- ✅ `landing`: **232/232** no vitest (34 ficheiros) · `tsc --noEmit` limpo
- ✅ Grep no build: **0** ocorrências de `saved vs` e de `Savings calculator` em `.next/`
- ✅ `classify.js` intacto (FROZEN): `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`
- ✅ **0 linhas** alteradas em `tools/` e em `packages/` (R1)
- ✅ `SYNC.md` a 185 linhas (tecto 200)
- ✅ Stage explícito, ficheiro a ficheiro — nunca `add -A`

## `n/d` declarado

O `next build` completa a compilação e falha na **recolha de páginas** por faltarem
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` nesta bancada — credencial que o
executor não tem. Os chunks compilados existem e foi neles que o grep correu; o build inteiro
só no CI.

## Também

- `plugin/mooter/skills/mooter/SKILL.md` ganha as três proibições de copy da **R4**: nenhum
  número de poupança; nunca «0 bytes saíram» (diz-se «nenhuma chamada cloud despachada pelo
  Mooter»); nunca barra de quota sem «estimado».
- `_handoff/onboarding-v2/abrir-pr.sh` — o script gh-gated que a **R3** exige nas sete ondas.
  Em ensaio por omissão; só empurra com `MOOTER_OK_DONO=1`. Nunca `--force`, nunca merge.
  Resolve o `gh` fora do `PATH` pela mesma razão que o `gh-bin.mjs`.

## Não faz

Não toca no `classify.js` nem no `patterns.js`. Não muda o esquema do ledger (é W4). Não abre
pricing. Não funde nada.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01CCFBbpAPoAQyZ45iF1VJbM
