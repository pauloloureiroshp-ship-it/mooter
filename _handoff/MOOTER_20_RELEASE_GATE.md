# 🐮 MOOTER 2.0 — RELEASE GATE

> **Este documento é a definição oficial de "2.0 pronto".** Composto por CC em 2026-07-16 (H4 do
> `MOOTER_20_TRUST_RELEASE_MASTERPROMPT.md`). ⛔ Só vira canon depois de o Paulo aprovar.
>
> **A régua:** `v2.0.0` **não é um número de versão — é o resultado de um teste com humanos.**
> A tag existe depois do gate humano passar. Nunca antes.

---

## A emenda que este doc faz ao masterprompt (e porquê)

O H4 pedia uma tabela `Gate | Prova exigida`. Escrita como prosa, ela seria **inverificável** — e este
ciclo mostrou o custo disso: o masterprompt citou uma "auditoria D1-h8" que **não existe** (a string
aparece uma única vez no repo: dentro do próprio masterprompt que a cita). Um gate que ninguém consegue
correr é teatro que dá conforto.

Por isso cada gate abaixo tem **o comando que o prova**. Onde não existe comando, a coluna diz `n/d` —
e `n/d` é um gate que **ainda não é um gate**, o que é informação, não falha.

---

## Os 7 gates

| # | Gate | Prova exigida | Como se verifica | Estado (2026-07-16) |
|---|---|---|---|---|
| 1 | **Estado durável** | F1 gates 1–5 merged + reauditoria F7 sem FAIL novo | `git merge-base --is-ancestor fix/remediation-perfect-handoff-p1 origin/main` · F7: `n/d` (sem harness) | ❌ F1 **não merged** |
| 2 | **Uma voz** | F2 merged + site H3 no ar + F4 docs/tagline + roadmap unificado (1 taxonomia) | `git merge-base --is-ancestor fix/remediation-cockpit-honest-copy origin/main` · site: `curl -s mooter.ai \| grep -c "<tagline>"` · taxonomia: `n/d` | ❌ F2 **não merged** · H3 gated nela |
| 3 | **Protocolo vivo** | Lingua Franca merged + 2 ciclos reais de handoff com `CCA: 5/5` | LF: `git merge-base --is-ancestor <lf-branch> origin/main` · ciclos: `node tools/handoff-preflight.js --lint _handoff/*.md` | ❌ LF em curso · **0 handoffs com CCA preenchido** (os 5 critérios do CCA-F não estão definidos no repo — ver Dívida 1) |
| 4 | **GPU visível** | Mesh fase A rodando + effort dial + 1 semana de recibos reais | `n/d` — **nenhum comando existe hoje.** Precisa de: contagem de recibos ≥7d no Ledger + `/moo effort` a responder | ❌ não começado |
| 5 | **Cockpit limpo** | cut-list H1 implementada + Radar MVP no plugin | cut-list: `_handoff/MOOTER_20_H1_CUT_LIST.md` decidida elemento-a-elemento · Radar: `ls packages/vscode-extension/src/*radar*` | ❌ cut-list **awaiting-you** · Radar: **0 ficheiros** |
| 6 | **LP confiável** | harness H2 verde no CI + recibo na UI | `npm run lp:trust` (por implementar) · CI: job `lp-trust` em `pull_request` | ❌ spec pronta, **não implementada**. ⚠️ Ver Dívida 2 — o gate hoje **não existe** |
| 7 | **🧍 GATE HUMANO** — *o único que importa* | **5 amigos: install sozinho <10min · D2 retention · 1 recibo de valor citado por eles** | **Não automatizável, por desenho.** Cronómetro real, pessoas reais, sem ajuda tua no ombro. | ❌ não começado |

**Regra da tag:** `v2.0.0` só existe depois do gate 7 passar. Verificação: `git tag -l "v2.0.0"` deve
devolver **vazio** até esse dia. Hoje devolve vazio ✓. Versão actual: `1.44.0`
(`tools/router/version.json` = fonte única; ver política de tags em `INFRA.md`).

---

## As 2 dívidas que impedem 2 gates de serem gates

**Dívida 1 — `CCA: n/5` não é verificável.** O gate 3 exige "2 ciclos com `CCA: 5/5`", mas **os 5
critérios do CCA-F não estão definidos em lado nenhum citável neste repo**: `AUDIT_CCA.md` não existe, e
o único documento com critérios tem **10**, não 5. Enquanto assim for, `CCA: 5/5` é uma assinatura sem
referente — e a regra de ouro do `PERFECT_HANDOFF_SPEC.md:95` obriga a `n/d`. **Acção:** canonizar os 5
critérios (dono: Cowork/LF), e então `handoff-preflight --lint` passa a poder validá-los.

**Dívida 2 — o gate 6 protege contra o risco errado.** A auditoria do LP dizia NO-GO por COH-01; esse P0
**está fechado** desde `e2924ce`. Os testes existem e passam: **687/687** (union LP) e **1393/1394**
(suite completa). O que **não** existe é o gate: `test.yml` só cobre `tools/router/**` e
`packages/cli/**`, e o único workflow que corre os testes da extensão é o `publish-cockpit.yml`, em
`push: tags:['cockpit-v*']` — **depois** da decisão de shipar. **Um PR pode partir os 687 testes e o CI
fica verde.** O harness completo do H2 é a resposta certa, mas ~15 linhas de YAML (um job de PR a correr
`npm ci && node --test src/*.test.js`) compram hoje a maior parte do valor.

---

## O que este gate deliberadamente NÃO exige

- **Não exige 100% dos cortes do H1.** Exige a cut-list **decidida**. Cortar 58,8% sem decisão é pior do
  que cortar 30% com ela.
- **Não exige o harness H2 completo** para o gate 6 passar — exige o **CI a gatear PRs**. O manifesto
  anti-rot e o recibo na UI são melhorias, não pré-requisitos de confiança.
- **Não exige zero dívida.** Exige dívida **declarada**. Um `n/d` honesto vale mais que um ✓ inventado.
- **Não exige métricas de marketing.** Nenhum gate menciona "melhor e mais barato que todos" — o
  posicionamento é custo afundado, não guerra de preço.

---

## A ordem em que caem (dependências reais, não desejadas)

```
F1 ──┐
F2 ──┼──> gates 1,2 ──> H3 (site)  ──┐
F3 ──┘                                │
LF ─────> gate 3 ─────────────────────┼──> 🧍 GATE HUMANO ──> tag v2.0.0
H1 decisão ──> gate 5 ────────────────┤     (5 amigos)         + changelog honesto
CI da extensão ──> gate 6 ────────────┤
mesh fase A ──> gate 4 ───────────────┘
```

Os gates 1–6 são **preparação**. O gate 7 é **o teste**. Nenhum dos seis, sozinho ou em conjunto, prova
que o Mooter serve para alguém — só prova que está pronto para ser testado por alguém.

---

## Estado agregado: **0 de 7 gates passam** (2026-07-16)

Isto não é mau sinal — é o gate a funcionar. Um checklist que passasse no dia em que foi escrito não
estaria a medir nada.

---

## Rodapés

`CCA: n/d` — ver Dívida 1: os 5 critérios do CCA-F não estão definidos neste repo, logo assinar `5/5`
seria inventar um referente. `PERFECT_HANDOFF_SPEC.md:95`: *"Quando incerto → 'n/d', nunca palpite."*

`🔍 council 8/8 · objeção mais forte: um gate doc escrito pelo mesmo agente que executou as fases é
auto-avaliação — eu marquei "0 de 7" sobre trabalho meu, e um agente com incentivo a parecer produtivo
teria afrouxado a barra (ex.: dar o gate 6 por "quase feito" porque a spec está pronta, ou o gate 5 por
"cut-list entregue"). O ciclo já provou que a auto-avaliação falha aqui: eu mesmo reportei duas vezes
"fleet-arm com 28 commits por push" que estavam todos pushed · resolvida: parcialmente, e digo a parte
que não fecha. Mitigado tirando o juízo do caminho — cada gate leva o COMANDO que o prova (Q4
script-first), e onde não há comando escrevi `n/d` em vez de uma opinião, o que me impede de dar por
passado o que não sei medir. Os gates 4 e 7 continuam sem verificação mecânica: o 4 por dívida, o 7 por
desenho (5 amigos e um cronómetro não são automatizáveis, e é isso que o torna o único que importa). A
parte que NÃO resolvi: quem valida este doc é o Paulo, não um script — o ⛔ STOP existe por isso.`

Council aplicado (8/8 verbatim, dadas pelo Paulo 2026-07-16 — a wave Lingua Franca vai canonizá-las no
`AGENTS.md`; até lá `handoff-preflight --lint` reporta `canon: n/d`):
1. **Fonte de verdade** — confrontei o estado REAL de cada gate por `git merge-base`/`git tag`/`ls`;
   nenhum estado foi lido de spec ou de mount datado. Foi assim que "F1/F2/F3 merged" caiu para
   não-merged e o Radar para 0 ficheiros.
2. **Escritor único** — doc novo, nenhum recurso vivo. Não colide com F1/F2/F3 nem com a LF.
3. **Reversível vs irreversível** — explícito: gates 1–6 são preparação autónoma; a **tag `v2.0.0` e o
   gate humano exigem o Paulo**. Nada aqui autoriza uma tag.
4. **Script-first** — a emenda central deste doc: cada gate leva o comando que o prova, em vez de prosa.
5. **Projeção vs 2ª verdade** — aponta, não duplica: versão vem de `tools/router/version.json`, política
   de tags do `INFRA.md`, cut-list do H1, provas do H2. Não recopiei nenhum.
6. **Degradação graciosa** — os comandos são `git`/`npm` nativos; nenhum gate depende de plugin ou daemon.
   Os `n/d` são exactamente onde a graça falta hoje.
7. **Frozen/allowlist/n-d** — ficheiro novo em `_handoff/`; `classify.js` intacto; zero ficheiros das
   allowlists do Codex (F1/F2/F3, LF). Todo incerto ficou `n/d`.
8. **Custo de reverter** — é um documento: reverter custa um `git revert`. Escolhi o caminho reversível
   deliberadamente — **nenhuma tag, nenhum push, nenhum merge** sai deste doc.

⛔ **STOP:** o Paulo aprova este gate doc — só então ele vira a definição oficial de "2.0 pronto".
