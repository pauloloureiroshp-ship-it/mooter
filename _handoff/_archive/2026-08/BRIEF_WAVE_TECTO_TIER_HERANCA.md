# BRIEF DE WAVE — tecto-tier-heranca (allowlist do pacote congelado)
Emitido por Cowork · 2026-08-18. A versão completa foi entregue ao Paulo no chat.

## ALLOWLIST (CLAUDE.md:26-27) — estes 4 ficheiros e nenhum outro
- packages/mooter-bridge/broker.js        (1 linha: passa __tier_ceiling no re-despacho)
- packages/mooter-bridge/seamless.js      (1 funcao nova applyInheritedTierCeiling + campos no ledger)
- packages/mooter-bridge/broker.test.js   (1 assert novo no B6)
- packages/mooter-bridge/seamless.test.js (1 teste novo)

Fora da allowlist, verificado: classify.js intacto (427d8c0b…), zero outros pacotes,
zero dependencias novas. Preferiu-se ADICAO a modificacao, como a wave 58.

## O defeito (ledger, nao inferido)
job-msy34jki-70d9  haiku T1  457 chars  US$0,0977   <- pai
job-msy35et1-3eb9  opus  T3 2595 chars  US$1,2432   <- 12,7x
job-msyccqw2-aa1d  opus  T3             US$1,5424
US$2,88 em 3 geracoes, zero trabalho verificado.

## O fix
broker.js:664  __tier_ceiling: pedido.tier || pedido.tier_pedido || undefined
seamless.js:1296 applyInheritedTierCeiling sobre TIER_ORDER [T0,T1,T2,T3,T5]
 - nunca promove · tecto invalido = no-op DECLARADO · o corte fica auditavel:
   tier=T1 tier_classificado=T3 tier_tecto_herdado=T1 tier_tecto_aplicado=true

## Provas (em _handoff/provas/, ja em UTF-8 legivel)
RED   98 / 96 pass / 2 fail
GREEN 98 / 98 pass / 0 fail
SUITE 1080 / 1079 pass / 0 fail / 1 skip
Escritas pelo codex (job-msyfqb21-8db9). RE-MEDIDAS pelo Cowork em Linux+Node22: 98/98.
Custo do job: n/d — nao foi medido, nao se inventa.

## Como aterrar
Branch PROPRIO a partir de origin/main. NAO no branch do slack-spike (#274 aberto, spike
descartavel que morre 2026-09-16). git add selectivo dos 4 ficheiros.
ATENCAO ao ratchet do docs-hygiene: 204/204, margem zero. Decidir onde vivem este brief
e as provas ANTES de os adicionar.

## Aceitacao
1. sha classify.js = 427d8c0b…4bc48f
2. cd packages/mooter-bridge && node --test = 1080/1079/0 fail/1 skip
3. diff --name-only = exactamente os 4 ficheiros (+docs)
4. Um evento novo pos-aprovacao tem tier_tecto_aplicado PRESENTE (true ou false).
   Ausencia e regressao silenciosa.
