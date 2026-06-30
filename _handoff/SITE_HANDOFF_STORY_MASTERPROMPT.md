# MASTERPROMPT — 🌐 Site: a história do handoff (mooter.ai)

Independente — corre quando quiseres. Lê `_handoff/_MASTER_ORCHESTRATION.md` (invariantes).

## Porquê
O site (`landing/`) está em `v1.39.0` e conta **só** a história do router/poupança (47%, 658 calls). Falta
o **maior selling point** que o Paulo descobriu: o **handoff perfeito** — *nunca acordar perdido, recuperar
o teu tempo, não te afogares em terminais*. Missão: adicionar essa história ao site, com a estética existente.

## Setup
```
git worktree add ../frugal-site -b feat/site-handoff-story main
cd ../frugal-site/landing && npm install
```

## Estuda (ancorado)
- `landing/app/page.tsx` (a homepage) + páginas (`under-the-hood`, `methodology`, `cockpit`). Tom (EN), estética,
  componentes existentes (cards, secções `§ live`, métricas). **Reusa o sistema visual — não inventes um novo.**

## Implementação
- Uma secção nova (ex.: **"Never wake up lost"**) que conta o handoff perfeito em humano:
  - resumo honesto depois de cada sessão (nunca diz "limpo" se há trabalho por aterrar);
  - memória auditável que regista cada decisão ($0, GPU local faz a mão-de-obra);
  - "bater o olho e saber o que fazer" — o tempo de volta.
- Tom do site (EN, conciso, honesto), **sem inventar números** (nada de métricas fabricadas — usa linguagem
  qualitativa ou números reais que existam no repo).

## Gate (pára e reporta)
- `cd landing && npm run build` (Next) **verde** · preview local OK · responsivo · dark mode.
- **NÃO faças deploy** (`vercel`/push para prod) sem o OK do Paulo — deploy = irreversível, gate humano.
- `git add` selectivo · commit · mostra o diff + screenshot do preview.
